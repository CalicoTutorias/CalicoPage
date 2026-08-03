/**
 * Unit tests — Tutor Availability Status Service
 *
 * Cubre el semáforo del panel de administración: umbrales, expansión de
 * bloques recurrentes/puntuales sobre la ventana móvil, recorte de la ventana,
 * fusión de solapes y resta de sesiones reservadas.
 *
 * La zona horaria de referencia es America/Bogota (UTC-5 fijo, sin horario de
 * verano), así que las conversiones esperadas son estables.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    availability: { findMany: jest.fn(), groupBy: jest.fn() },
    schedule: { findMany: jest.fn() },
    session: { findMany: jest.fn() },
  },
}));

const prisma = require('@/lib/prisma').default;
const {
  getAvailabilityStatusForTutors,
  deriveAvailabilityStatus,
  mergeIntervals,
  subtractIntervals,
} = require('@/lib/services/tutor-availability-status.service');

const TUTOR = 'tutor-1';
// Miércoles 5 de agosto de 2026, 08:00 en Bogotá (13:00 UTC).
const NOW = new Date('2026-08-05T13:00:00.000Z');

/** Bloque semanal: `time` en formato "HH:MM" de pared local. */
function weeklyBlock(dayOfWeek, start, end) {
  return {
    userId: TUTOR,
    dayOfWeek,
    startTime: new Date(`1970-01-01T${start}:00.000Z`),
    endTime: new Date(`1970-01-01T${end}:00.000Z`),
    recurring: true,
    specificDate: null,
  };
}

function oneOffBlock(isoDate, start, end) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return {
    userId: TUTOR,
    dayOfWeek: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    startTime: new Date(`1970-01-01T${start}:00.000Z`),
    endTime: new Date(`1970-01-01T${end}:00.000Z`),
    recurring: false,
    specificDate: new Date(`${isoDate}T00:00:00.000Z`),
  };
}

function schedule(overrides = {}) {
  return {
    userId: TUTOR,
    timezone: 'America/Bogota',
    calendarConnectedAt: new Date('2026-07-01T00:00:00.000Z'),
    calendarLastSyncedAt: new Date('2026-08-04T00:00:00.000Z'),
    calendarLastSyncOk: true,
    ...overrides,
  };
}

/**
 * Ejecuta el servicio con el estado de BD dado.
 *
 * `blockCounts` simula el groupBy de TODOS los bloques del tutor. Por defecto
 * se deriva de `blocks`, que es lo natural; se pasa a mano solo para simular a
 * un tutor cuya disponibilidad existe pero cae fuera de la ventana.
 */
async function run({ blocks = [], schedules = [schedule()], sessions = [], blockCounts } = {}) {
  const counts = blockCounts ?? (blocks.length
    ? [{ userId: TUTOR, source: 'manual', _count: { _all: blocks.length } }]
    : []);

  prisma.availability.findMany.mockResolvedValue(blocks);
  prisma.availability.groupBy.mockResolvedValue(counts);
  prisma.schedule.findMany.mockResolvedValue(schedules);
  prisma.session.findMany.mockResolvedValue(sessions);

  const map = await getAvailabilityStatusForTutors([TUTOR], { now: NOW });
  return map.get(TUTOR);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Función pura de umbrales ─────────────────────────────────────────────

describe('deriveAvailabilityStatus', () => {
  const thresholdMinutes = 600; // 10 h

  it('devuelve gris solo cuando el tutor no ha configurado nada', () => {
    expect(deriveAvailabilityStatus({ hasAnyBlocks: false, minutes: 0, thresholdMinutes }))
      .toBe('not_configured');
  });

  it('devuelve rojo con bloques configurados pero 0 horas', () => {
    expect(deriveAvailabilityStatus({ hasAnyBlocks: true, minutes: 0, thresholdMinutes }))
      .toBe('none');
  });

  it('devuelve amarillo justo por debajo del umbral', () => {
    expect(deriveAvailabilityStatus({ hasAnyBlocks: true, minutes: 599, thresholdMinutes }))
      .toBe('low');
  });

  it('devuelve verde en el umbral exacto', () => {
    expect(deriveAvailabilityStatus({ hasAnyBlocks: true, minutes: 600, thresholdMinutes }))
      .toBe('ok');
  });

  it('devuelve verde por encima del umbral', () => {
    expect(deriveAvailabilityStatus({ hasAnyBlocks: true, minutes: 601, thresholdMinutes }))
      .toBe('ok');
  });
});

// ─── Álgebra de intervalos ────────────────────────────────────────────────

describe('mergeIntervals', () => {
  it('fusiona solapes para no contar dos veces la misma franja', () => {
    expect(mergeIntervals([
      { start: 0, end: 100 },
      { start: 50, end: 150 },
      { start: 200, end: 250 },
    ])).toEqual([
      { start: 0, end: 150 },
      { start: 200, end: 250 },
    ]);
  });

  it('descarta intervalos vacíos o invertidos', () => {
    expect(mergeIntervals([{ start: 100, end: 100 }, { start: 200, end: 150 }])).toEqual([]);
  });
});

describe('subtractIntervals', () => {
  it('parte un intervalo en dos cuando la reserva cae en medio', () => {
    expect(subtractIntervals(
      [{ start: 0, end: 100 }],
      [{ start: 40, end: 60 }],
    )).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });

  it('elimina el intervalo si la reserva lo cubre entero', () => {
    expect(subtractIntervals([{ start: 0, end: 100 }], [{ start: 0, end: 100 }])).toEqual([]);
  });
});

// ─── Cálculo end-to-end ───────────────────────────────────────────────────

describe('getAvailabilityStatusForTutors', () => {
  it('no consulta nada si no hay tutores', async () => {
    const map = await getAvailabilityStatusForTutors([]);
    expect(map.size).toBe(0);
    expect(prisma.availability.findMany).not.toHaveBeenCalled();
  });

  it('hace 4 consultas en bloque para muchos tutores (sin N+1)', async () => {
    prisma.availability.findMany.mockResolvedValue([]);
    prisma.availability.groupBy.mockResolvedValue([]);
    prisma.schedule.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);

    const ids = Array.from({ length: 50 }, (_, i) => `tutor-${i}`);
    const map = await getAvailabilityStatusForTutors(ids, { now: NOW });

    expect(map.size).toBe(50);
    expect(prisma.availability.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.availability.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.schedule.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.session.findMany).toHaveBeenCalledTimes(1);
  });

  it('marca gris solo al tutor que nunca configuró disponibilidad', async () => {
    const result = await run({ blocks: [], schedules: [] });
    expect(result.status).toBe('not_configured');
    expect(result.hasAnyBlocks).toBe(false);
  });

  // El corazón de la corrección: poner la disponibilidad a mano es tan válido
  // como sincronizarla, así que sin Google Calendar el semáforo NO es gris.
  it('cuenta las horas manuales aunque no haya Google Calendar conectado', async () => {
    const result = await run({
      blocks: [oneOffBlock('2026-08-07', '09:00', '19:00')],
      schedules: [schedule({
        calendarConnectedAt: null,
        calendarLastSyncedAt: null,
        calendarLastSyncOk: null,
      })],
      blockCounts: [{ userId: TUTOR, source: 'manual', _count: { _all: 1 } }],
    });
    expect(result.status).toBe('ok');
    expect(result.hours).toBe(10);
    expect(result.calendarConnected).toBe(false);
    expect(result.sources).toEqual(['manual']);
  });

  it('una sincronización rancia ya no fuerza gris, solo se señala', async () => {
    const result = await run({
      blocks: [oneOffBlock('2026-08-07', '09:00', '19:00')],
      schedules: [schedule({ calendarLastSyncedAt: new Date('2026-06-01T00:00:00.000Z') })],
    });
    expect(result.status).toBe('ok');
    expect(result.staleSync).toBe(true);
  });

  it('distingue "configurada pero sin horas esta semana" de "sin configurar"', async () => {
    // Tiene bloques en BD, pero todos caen fuera de la ventana de 7 días.
    const result = await run({
      blocks: [],
      blockCounts: [{ userId: TUTOR, source: 'manual', _count: { _all: 3 } }],
    });
    expect(result.status).toBe('none');
    expect(result.hours).toBe(0);
    expect(result.hasAnyBlocks).toBe(true);
  });

  it('reporta ambas fuentes cuando el tutor mezcla manual y Google', async () => {
    const result = await run({
      blocks: [oneOffBlock('2026-08-07', '09:00', '14:00')],
      blockCounts: [
        { userId: TUTOR, source: 'manual', _count: { _all: 2 } },
        { userId: TUTOR, source: 'calendar_sync', _count: { _all: 4 } },
      ],
    });
    expect(result.sources).toEqual(['manual', 'calendar_sync']);
    expect(result.totalBlocks).toBe(6);
  });

  it('expande un bloque semanal a lo largo de toda la ventana', async () => {
    // Lunes 09:00–13:00 (4 h). En una ventana de 7 días desde el miércoles solo
    // cae un lunes: el del 10 de agosto.
    const result = await run({ blocks: [weeklyBlock(1, '09:00', '13:00')] });
    expect(result.hours).toBe(4);
    expect(result.status).toBe('low');
  });

  it('recorta el día en curso: un bloque ya pasado no cuenta', async () => {
    // Bloque puntual de HOY 06:00–07:00 local, con "ahora" a las 08:00 local.
    const result = await run({ blocks: [oneOffBlock('2026-08-05', '06:00', '07:00')] });
    expect(result.hours).toBe(0);
  });

  it('cuenta solo la parte futura de un bloque en curso', async () => {
    // Bloque puntual de HOY 07:00–11:00 local con "ahora" a las 08:00 → 3 h.
    const result = await run({ blocks: [oneOffBlock('2026-08-05', '07:00', '11:00')] });
    expect(result.hours).toBe(3);
  });

  it('cuenta las dos puntas de la ventana móvil para el mismo día de la semana', async () => {
    // La ventana va del miércoles 08:00 al miércoles siguiente 08:00, así que
    // un bloque semanal de miércoles 07:00–11:00 aporta 3 h hoy (08:00–11:00)
    // y 1 h el día 12 (07:00–08:00, antes de que la ventana se cierre).
    const result = await run({ blocks: [weeklyBlock(3, '07:00', '11:00')] });
    expect(result.hours).toBe(4);
  });

  it('incluye bloques puntuales dentro de la ventana e ignora los de fuera', async () => {
    const dentro = await run({ blocks: [oneOffBlock('2026-08-07', '09:00', '14:00')] });
    expect(dentro.hours).toBe(5);

    const fuera = await run({ blocks: [oneOffBlock('2026-09-07', '09:00', '14:00')] });
    expect(fuera.hours).toBe(0);
  });

  it('no cuenta dos veces un bloque manual solapado con uno sincronizado', async () => {
    const result = await run({
      blocks: [
        oneOffBlock('2026-08-07', '09:00', '14:00'),
        oneOffBlock('2026-08-07', '10:00', '15:00'),
      ],
    });
    expect(result.hours).toBe(6); // 09:00–15:00, no 5 + 5
  });

  it('resta las sesiones ya reservadas', async () => {
    const result = await run({
      blocks: [oneOffBlock('2026-08-07', '09:00', '19:00')], // 10 h → verde
      sessions: [{
        tutorId: TUTOR,
        startTimestamp: new Date('2026-08-07T15:00:00.000Z'), // 10:00 local
        endTimestamp: new Date('2026-08-07T17:00:00.000Z'),   // 12:00 local
      }],
    });
    expect(result.hours).toBe(8);
    expect(result.status).toBe('low'); // cruzó por debajo del umbral
  });

  it('devuelve verde en el umbral exacto de 10 h', async () => {
    const result = await run({ blocks: [oneOffBlock('2026-08-07', '09:00', '19:00')] });
    expect(result.hours).toBe(10);
    expect(result.status).toBe('ok');
  });

  it('respeta la zona horaria del tutor', async () => {
    // Mismo bloque de pared (09:00–14:00) en Madrid: son 5 h igualmente, pero
    // caen en instantes UTC distintos. Lo que se comprueba es que no se pierden
    // horas al cruzar el desfase.
    const result = await run({
      blocks: [oneOffBlock('2026-08-07', '09:00', '14:00')],
      schedules: [schedule({ timezone: 'Europe/Madrid' })],
    });
    expect(result.hours).toBe(5);
  });

  it('expone el umbral y la ventana para que la UI no los duplique', async () => {
    const result = await run({ blocks: [] });
    expect(result.thresholdHours).toBe(10);
    expect(result.windowDays).toBe(7);
  });
});
