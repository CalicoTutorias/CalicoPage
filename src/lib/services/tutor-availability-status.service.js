/**
 * Tutor Availability Status Service
 *
 * Calcula, para un conjunto de tutores, cuántas horas LIBRES tienen en la
 * ventana móvil de los próximos N días (por defecto 7, desde NOW()) y traduce
 * ese número a un semáforo:
 *
 *   not_configured (⚪) — el tutor nunca ha configurado disponibilidad
 *   none           (🔴) — tiene bloques, pero 0 horas en la ventana
 *   low            (🟡) — 0 < horas < MIN_HOURS_THRESHOLD
 *   ok             (🟢) — horas >= MIN_HOURS_THRESHOLD
 *
 * IMPORTANTE: el semáforo NO depende de Google Calendar. El tutor puede poner
 * su disponibilidad a mano o sincronizándola desde Google, y las dos formas son
 * igual de válidas: lo único que importa son las horas resultantes. El estado
 * de la integración con Google viaja aparte (`calendarConnected`, `sources`,
 * `staleSync`) como metadato de diagnóstico, nunca como color.
 *
 * NO llama a la API de Google: los bloques ya están materializados en la tabla
 * `availabilities`, sea por edición manual o por
 * `availability.service.syncAvailabilityFromCalendar`. Para evitar N+1 hace 4
 * consultas en bloque (bloques de la ventana, recuento total por fuente,
 * schedules y sesiones) sea cual sea el número de tutores pedidos.
 *
 * "Horas libres" = bloques de disponibilidad publicados, fusionando solapes,
 * menos las sesiones ya reservadas (Pending/Accepted) dentro de la ventana.
 */

import prisma from '../prisma';
import {
  AVAILABILITY_WINDOW_DAYS,
  MIN_HOURS_THRESHOLD,
  CALENDAR_SYNC_STALE_DAYS,
  DEFAULT_TIMEZONE,
} from '../../config/availability';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

// ─── Helpers de zona horaria ──────────────────────────────────────────────
// Los bloques guardan una hora de pared local (`TIME`) y un `dayOfWeek` local,
// así que hay que resolverlos contra la zona del tutor, no contra la del
// servidor. Se usa Intl para no añadir una dependencia de fechas.

/**
 * Desfase de una zona horaria respecto a UTC, en ms, en un instante concreto.
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
function getTimeZoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // algunas locales devuelven "24" para medianoche
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

/**
 * Partes del calendario local (año/mes/día/día de la semana) de un instante.
 * @param {Date} date
 * @param {string} timeZone
 */
function getZonedDateParts(date, timeZone) {
  const shifted = new Date(date.getTime() + getTimeZoneOffsetMs(date, timeZone));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

/**
 * Convierte una hora de pared local (fecha + minutos desde medianoche) al
 * instante UTC correspondiente. Se recalcula el desfase una segunda vez para
 * quedar del lado correcto de un cambio de horario de verano.
 *
 * @returns {number} timestamp en ms
 */
function zonedWallTimeToTimestamp(year, month, day, minutes, timeZone) {
  const asIfUtc = Date.UTC(year, month - 1, day) + minutes * MS_PER_MINUTE;

  const firstOffset = getTimeZoneOffsetMs(new Date(asIfUtc), timeZone);
  const firstGuess = asIfUtc - firstOffset;

  const secondOffset = getTimeZoneOffsetMs(new Date(firstGuess), timeZone);
  return secondOffset === firstOffset ? firstGuess : asIfUtc - secondOffset;
}

/** Minutos desde medianoche de un `TIME` de Prisma (guardado como 1970-01-01THH:MM:SSZ). */
function timeToMinutes(value) {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }
  const [h, m] = String(value).split(':');
  return Number(h) * 60 + Number(m);
}

/** "YYYY-MM-DD" de un `DATE` de Prisma (medianoche UTC). */
function dateToIsoDay(value) {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString().substring(0, 10)
    : String(value).substring(0, 10);
}

// ─── Álgebra de intervalos ────────────────────────────────────────────────

/**
 * Fusiona intervalos solapados o contiguos. Es imprescindible: un tutor puede
 * tener un bloque `manual` y otro `calendar_sync` cubriendo la misma franja, y
 * sumarlos por separado duplicaría las horas.
 *
 * @param {Array<{start: number, end: number}>} intervals
 * @returns {Array<{start: number, end: number}>}
 */
export function mergeIntervals(intervals) {
  const sorted = [...intervals]
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/**
 * Resta `busy` de `base`. Ambos se asumen ya fusionados y ordenados.
 *
 * @param {Array<{start: number, end: number}>} base
 * @param {Array<{start: number, end: number}>} busy
 * @returns {Array<{start: number, end: number}>}
 */
export function subtractIntervals(base, busy) {
  let result = base.map((i) => ({ ...i }));

  for (const block of busy) {
    const next = [];
    for (const free of result) {
      if (block.end <= free.start || block.start >= free.end) {
        next.push(free);                                   // sin solape
        continue;
      }
      if (block.start > free.start) next.push({ start: free.start, end: block.start });
      if (block.end < free.end) next.push({ start: block.end, end: free.end });
    }
    result = next;
  }

  return result;
}

function totalMinutes(intervals) {
  return intervals.reduce((sum, i) => sum + (i.end - i.start), 0) / MS_PER_MINUTE;
}

// ─── Derivación del estado ────────────────────────────────────────────────

export const AVAILABILITY_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  NONE: 'none',
  LOW: 'low',
  OK: 'ok',
});

/**
 * Traduce (bloques configurados, minutos libres) al estado del semáforo.
 * Función pura, deliberadamente ciega a Google Calendar: da igual si las horas
 * las puso el tutor a mano o vienen de una sincronización.
 *
 * Se compara en MINUTOS enteros, no en horas decimales: con horas el caso
 * frontera de exactamente 10 h puede caer en 9.999999… y pintarse amarillo.
 *
 * @param {{ hasAnyBlocks: boolean, minutes: number, thresholdMinutes: number }} input
 * @returns {'not_configured'|'none'|'low'|'ok'}
 */
export function deriveAvailabilityStatus({ hasAnyBlocks, minutes, thresholdMinutes }) {
  if (!hasAnyBlocks) return AVAILABILITY_STATUS.NOT_CONFIGURED;
  if (minutes <= 0) return AVAILABILITY_STATUS.NONE;
  if (minutes < thresholdMinutes) return AVAILABILITY_STATUS.LOW;
  return AVAILABILITY_STATUS.OK;
}

/**
 * Estado de la integración con Google Calendar. Es informativo: no decide el
 * color. Sirve para distinguir "este tutor lleva su agenda a mano" de "este
 * tutor la sincronizaba y la sincronización lleva semanas muerta".
 */
function resolveCalendarConnection(schedule, now) {
  const connectedAt = schedule?.calendarConnectedAt ?? null;
  const lastSyncedAt = schedule?.calendarLastSyncedAt ?? null;

  if (!connectedAt && !lastSyncedAt) {
    return { calendarConnected: false, staleSync: false, lastSyncedAt: null };
  }

  const reference = lastSyncedAt ?? connectedAt;
  const staleSync =
    now.getTime() - new Date(reference).getTime() > CALENDAR_SYNC_STALE_DAYS * MS_PER_DAY;

  return { calendarConnected: true, staleSync, lastSyncedAt };
}

// ─── Cálculo principal ────────────────────────────────────────────────────

/**
 * Expande los bloques de un tutor sobre la ventana y devuelve los intervalos
 * absolutos (en ms) recortados a [windowStart, windowEnd].
 */
function expandBlocksToIntervals(blocks, timeZone, windowStart, windowEnd, windowDays) {
  const intervals = [];
  const startParts = getZonedDateParts(new Date(windowStart), timeZone);

  // La ventana puede tocar windowDays+1 fechas locales (empieza a media tarde
  // de hoy y termina a media tarde del día N).
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const cursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day + offset));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const dayOfWeek = cursor.getUTCDay();
    const isoDay = cursor.toISOString().substring(0, 10);

    for (const block of blocks) {
      const applies = block.recurring
        ? block.dayOfWeek === dayOfWeek
        : dateToIsoDay(block.specificDate) === isoDay;
      if (!applies) continue;

      const startMinute = timeToMinutes(block.startTime);
      const endMinute = timeToMinutes(block.endTime);
      if (endMinute <= startMinute) continue; // el modelo no soporta bloques nocturnos

      const start = Math.max(
        zonedWallTimeToTimestamp(year, month, day, startMinute, timeZone),
        windowStart,
      );
      const end = Math.min(
        zonedWallTimeToTimestamp(year, month, day, endMinute, timeZone),
        windowEnd,
      );

      if (end > start) intervals.push({ start, end });
    }
  }

  return intervals;
}

/**
 * Estado de disponibilidad de varios tutores, en 3 consultas fijas.
 *
 * @param {string[]} tutorIds
 * @param {{ now?: Date, windowDays?: number, thresholdHours?: number }} [options]
 * @returns {Promise<Map<string, object>>} tutorId → estado
 */
export async function getAvailabilityStatusForTutors(tutorIds, options = {}) {
  const ids = [...new Set((tutorIds ?? []).filter(Boolean))];
  const result = new Map();
  if (ids.length === 0) return result;

  const now = options.now ?? new Date();
  const windowDays = options.windowDays ?? AVAILABILITY_WINDOW_DAYS;
  const thresholdHours = options.thresholdHours ?? MIN_HOURS_THRESHOLD;
  const thresholdMinutes = thresholdHours * 60;

  const windowStart = now.getTime();
  const windowEnd = windowStart + windowDays * MS_PER_DAY;

  // Margen de un día a cada lado: la fecha local del tutor puede ir por delante
  // o por detrás de la del servidor.
  const specificFrom = new Date(windowStart - MS_PER_DAY);
  const specificTo = new Date(windowEnd + MS_PER_DAY);

  const [blocks, blockCounts, schedules, sessions] = await Promise.all([
    prisma.availability.findMany({
      where: {
        userId: { in: ids },
        OR: [
          { recurring: true },
          { specificDate: { gte: specificFrom, lte: specificTo } },
        ],
      },
      select: {
        userId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        recurring: true,
        specificDate: true,
      },
    }),
    // Recuento de TODOS los bloques (fuera de la ventana también), agrupado por
    // fuente. Distingue "nunca configuró disponibilidad" (gris) de "la tiene
    // configurada pero esta semana no le queda hueco" (rojo), y revela si el
    // tutor la lleva a mano, sincronizada, o las dos cosas.
    prisma.availability.groupBy({
      by: ['userId', 'source'],
      where: { userId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.schedule.findMany({
      where: { userId: { in: ids } },
      select: {
        userId: true,
        timezone: true,
        calendarConnectedAt: true,
        calendarLastSyncedAt: true,
        calendarLastSyncOk: true,
      },
    }),
    prisma.session.findMany({
      where: {
        tutorId: { in: ids },
        status: { in: ['Pending', 'Accepted'] },
        startTimestamp: { lt: new Date(windowEnd) },
        endTimestamp: { gt: now },
      },
      select: { tutorId: true, startTimestamp: true, endTimestamp: true },
    }),
  ]);

  const blocksByTutor = groupBy(blocks, (b) => b.userId);
  const schedulesByTutor = new Map(schedules.map((s) => [s.userId, s]));
  const sessionsByTutor = groupBy(sessions, (s) => s.tutorId);

  // tutorId → { total, sources: ['manual', 'calendar_sync'] }
  const countsByTutor = new Map();
  for (const row of blockCounts) {
    const entry = countsByTutor.get(row.userId) ?? { total: 0, sources: [] };
    entry.total += row._count?._all ?? 0;
    if (row.source && !entry.sources.includes(row.source)) entry.sources.push(row.source);
    countsByTutor.set(row.userId, entry);
  }

  for (const tutorId of ids) {
    const schedule = schedulesByTutor.get(tutorId) ?? null;
    const timeZone = schedule?.timezone || DEFAULT_TIMEZONE;
    const calendar = resolveCalendarConnection(schedule, now);
    const counts = countsByTutor.get(tutorId) ?? { total: 0, sources: [] };

    const free = subtractIntervals(
      mergeIntervals(
        expandBlocksToIntervals(
          blocksByTutor.get(tutorId) ?? [],
          timeZone,
          windowStart,
          windowEnd,
          windowDays,
        ),
      ),
      mergeIntervals(
        (sessionsByTutor.get(tutorId) ?? []).map((s) => ({
          start: Math.max(s.startTimestamp.getTime(), windowStart),
          end: Math.min(s.endTimestamp.getTime(), windowEnd),
        })),
      ),
    );

    const minutes = totalMinutes(free);

    result.set(tutorId, {
      status: deriveAvailabilityStatus({
        hasAnyBlocks: counts.total > 0,
        minutes,
        thresholdMinutes,
      }),
      hours: Math.round((minutes / 60) * 100) / 100,
      hasAnyBlocks: counts.total > 0,
      totalBlocks: counts.total,
      sources: counts.sources,                       // 'manual' y/o 'calendar_sync'
      thresholdHours,
      windowDays,
      // Metadatos de Google Calendar: diagnóstico, no deciden el color.
      calendarConnected: calendar.calendarConnected,
      staleSync: calendar.staleSync,
      lastSyncedAt: calendar.lastSyncedAt,
      lastSyncOk: schedule?.calendarLastSyncOk ?? null,
    });
  }

  return result;
}

/**
 * Igual que `getAvailabilityStatusForTutors` para un solo tutor.
 * @param {string} tutorId
 * @returns {Promise<object|null>}
 */
export async function getAvailabilityStatusForTutor(tutorId, options = {}) {
  const map = await getAvailabilityStatusForTutors([tutorId], options);
  return map.get(tutorId) ?? null;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row);
    else map.set(key, [row]);
  }
  return map;
}
