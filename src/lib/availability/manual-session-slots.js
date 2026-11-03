/**
 * Horarios que se pueden elegir al registrar una tutoría manual.
 *
 * Lo usan el formulario de admin (para ofrecer solo opciones reales) y
 * `createManualSession` (para volver a comprobarlas en el servidor), de modo
 * que lo que se ofrece y lo que se acepta no pueden divergir.
 *
 * Las reglas son las de la reserva de un estudiante: solo bloques publicados
 * (`selectBookableBlocks`), inicios cada hora desde el comienzo del bloque, el
 * tiempo de buffer alrededor de cada sesión y el máximo de sesiones por día.
 * A diferencia de la reserva, una tutoría manual puede durar más de 1 h, así
 * que cada inicio dice qué duraciones caben.
 *
 * Módulo puro (sin Prisma ni fetch).
 */

import { DEFAULT_TIMEZONE } from '../../config/availability';
import { blockAppliesToDate, selectBookableBlocks } from './bookable-blocks';
import { getZonedDateParts, timeToMinutes, zonedWallTimeToTimestamp } from './zoned-time';

/** Duraciones ofrecidas, en minutos. */
export const MANUAL_SESSION_DURATIONS = Object.freeze([60, 90, 120]);

/** Hasta dónde se ofrece agenda (la misma ventana que sincroniza Google Calendar). */
export const MANUAL_SLOT_DAYS_AHEAD = 60;

const MS_PER_MINUTE = 60_000;
const SLOT_STEP_MS = 60 * MS_PER_MINUTE;
const MIN_DURATION_MS = MANUAL_SESSION_DURATIONS[0] * MS_PER_MINUTE;

function isoDay(date, timeZone) {
  const { year, month, day } = getZonedDateParts(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().substring(0, 10);
}

/**
 * @param {object} args
 * @param {Array} args.blocks   todos los bloques del tutor
 * @param {object|null} args.schedule  timezone, bufferTime, maxSessionsPerDay, calendarSyncMode
 * @param {Array<{startTimestamp: Date|string, endTimestamp: Date|string}>} args.sessions
 *   sesiones activas del tutor en la ventana (sin Rejected ni Canceled)
 * @param {Date} [args.now]
 * @param {number} [args.daysAhead]
 * @returns {{ timeZone: string, bufferMinutes: number, days: Array<{
 *   date: string,
 *   slots: Array<{ startTimestamp: string, time: string, durations: number[] }>,
 * }> }}  `date` y `time` son hora local del tutor; `startTimestamp` es el instante exacto
 */
export function buildManualSessionSlots({
  blocks,
  schedule,
  sessions = [],
  now = new Date(),
  daysAhead = MANUAL_SLOT_DAYS_AHEAD,
}) {
  const timeZone = schedule?.timezone || DEFAULT_TIMEZONE;
  const bufferMinutes = schedule?.bufferTime ?? 15;
  const maxPerDay = schedule?.maxSessionsPerDay ?? 5;

  const bufferMs = bufferMinutes * MS_PER_MINUTE;
  const busy = sessions.map((s) => ({
    start: new Date(s.startTimestamp).getTime() - bufferMs,
    end: new Date(s.endTimestamp).getTime() + bufferMs,
  }));

  const sessionsPerDay = new Map();
  for (const s of sessions) {
    const day = isoDay(new Date(s.startTimestamp), timeZone);
    sessionsPerDay.set(day, (sessionsPerDay.get(day) ?? 0) + 1);
  }

  const published = selectBookableBlocks(blocks, schedule);
  const formatTime = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const nowMs = now.getTime();
  const first = getZonedDateParts(now, timeZone);

  const days = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const cursor = new Date(Date.UTC(first.year, first.month - 1, first.day + offset));
    const date = cursor.toISOString().substring(0, 10);
    if ((sessionsPerDay.get(date) ?? 0) >= maxPerDay) continue;

    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const dayOfWeek = cursor.getUTCDay();

    // Un bloque manual y su copia sincronizada pueden cubrir la misma franja:
    // indexar por instante evita repetir el inicio y une lo que cabe en cada uno.
    const byStart = new Map();
    for (const block of published) {
      if (!blockAppliesToDate(block, date, dayOfWeek)) continue;
      const blockStart = zonedWallTimeToTimestamp(year, month, day, timeToMinutes(block.startTime), timeZone);
      const blockEnd = zonedWallTimeToTimestamp(year, month, day, timeToMinutes(block.endTime), timeZone);

      for (let start = blockStart; start + MIN_DURATION_MS <= blockEnd; start += SLOT_STEP_MS) {
        if (start <= nowMs) continue;
        const fits = MANUAL_SESSION_DURATIONS.filter((minutes) => {
          const end = start + minutes * MS_PER_MINUTE;
          return end <= blockEnd && !busy.some((b) => b.start < end && b.end > start);
        });
        if (fits.length === 0) continue;
        const known = byStart.get(start) ?? [];
        byStart.set(start, [...new Set([...known, ...fits])].sort((a, b) => a - b));
      }
    }

    if (byStart.size === 0) continue;
    days.push({
      date,
      slots: [...byStart.entries()]
        .sort(([a], [b]) => a - b)
        .map(([start, durations]) => ({
          startTimestamp: new Date(start).toISOString(),
          time: formatTime.format(start),
          durations,
        })),
    });
  }

  return { timeZone, bufferMinutes, days };
}
