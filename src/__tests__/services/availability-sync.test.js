/**
 * Unit tests — Google Calendar sync (availability.service)
 *
 * Cubre el modo «eventos = ocupado»: la disponibilidad publicada es la base
 * manual menos los eventos de Google, materializada como bloques de una sola
 * vez para la ventana de sincronización; y el cableado de
 * `syncAvailabilityFromCalendar` (modo, zona horaria, aviso sin base).
 *
 * Zona de referencia: America/Bogota (UTC-5 fijo).
 */

jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findScheduleByUserId: jest.fn(),
  replaceCalendarSyncedAvailability: jest.fn(),
  upsertSchedule: jest.fn(),
}));

jest.mock('@/lib/services/calendar.service', () => ({
  getAccessTokenOrRefresh: jest.fn(),
  listCalendars: jest.fn(),
  listEvents: jest.fn(),
}));

jest.mock('@/lib/services/course-notify.service', () => ({
  evaluateTutorAvailabilityNotifications: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { availability: {}, session: { findMany: jest.fn() } },
}));

const availabilityRepo = require('@/lib/repositories/availability.repository');
const calendarService = require('@/lib/services/calendar.service');
const {
  syncAvailabilityFromCalendar,
  deriveFreeBlocksFromBusyEvents,
  collectBusyIntervalsByDate,
  snapIntervalToSlotMarks,
  SYNC_WINDOW_DAYS,
} = require('@/lib/services/availability.service');

const USER = 'tutor-1';
// Sábado 5 de septiembre de 2026, 10:00 en Bogotá (15:00 UTC).
const NOW = new Date('2026-09-05T15:00:00.000Z');

function time(hhmm) {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

/** Bloque manual recurrente (lunes 08:00–12:00 por defecto). */
function manualBlock(overrides = {}) {
  return {
    id: 'base-1',
    userId: USER,
    dayOfWeek: 1,
    startTime: time('08:00'),
    endTime: time('12:00'),
    recurring: true,
    specificDate: null,
    source: 'manual',
    ...overrides,
  };
}

function timedEvent(startLocal, endLocal, extra = {}) {
  return {
    id: `${startLocal}/${endLocal}`,
    status: 'confirmed',
    start: { dateTime: `${startLocal}-05:00`, timeZone: 'America/Bogota' },
    end: { dateTime: `${endLocal}-05:00`, timeZone: 'America/Bogota' },
    ...extra,
  };
}

function allDayEvent(startDate, endDateExclusive, extra = {}) {
  return {
    id: `allday-${startDate}`,
    status: 'confirmed',
    start: { date: startDate },
    end: { date: endDateExclusive },
    ...extra,
  };
}

/** Resumen legible de un bloque derivado: "YYYY-MM-DD HH:MM-HH:MM". */
function describeBlock(b) {
  const hhmm = (d) => d.toISOString().substring(11, 16);
  return `${b.specificDate.toISOString().substring(0, 10)} ${hhmm(b.startTime)}-${hhmm(b.endTime)}`;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Piezas puras ─────────────────────────────────────────────────────────

describe('snapIntervalToSlotMarks', () => {
  it('deja intacto un intervalo que ya cumple las reglas', () => {
    expect(snapIntervalToSlotMarks({ start: 8 * 60, end: 12 * 60 })).toEqual({ start: 480, end: 720 });
  });

  it('redondea el inicio hacia arriba y el fin hacia abajo a una marca permitida', () => {
    // 10:15 → 10:20 ; 12:00 se queda
    expect(snapIntervalToSlotMarks({ start: 10 * 60 + 15, end: 12 * 60 })).toEqual({ start: 620, end: 720 });
    // 08:00 se queda ; 11:57 → 11:50
    expect(snapIntervalToSlotMarks({ start: 8 * 60, end: 11 * 60 + 57 })).toEqual({ start: 480, end: 710 });
    // 09:55 → 10:00 (no hay marca ≥ 55 dentro de la hora)
    expect(snapIntervalToSlotMarks({ start: 9 * 60 + 55, end: 12 * 60 })).toEqual({ start: 600, end: 720 });
  });

  it('descarta lo que no llega a una franja completa de 1 h', () => {
    expect(snapIntervalToSlotMarks({ start: 11 * 60 + 5, end: 12 * 60 })).toBeNull(); // 11:10–12:00 = 50 min
    expect(snapIntervalToSlotMarks({ start: 8 * 60, end: 8 * 60 + 59 })).toBeNull();
  });
});

describe('collectBusyIntervalsByDate', () => {
  it('indexa eventos con hora por fecha local, en minutos', () => {
    const map = collectBusyIntervalsByDate([timedEvent('2026-09-07T09:00:00', '2026-09-07T10:30:00')]);
    expect(map.get('2026-09-07')).toEqual([{ start: 540, end: 630 }]);
  });

  it('parte en dos los eventos que cruzan medianoche', () => {
    const map = collectBusyIntervalsByDate([timedEvent('2026-10-04T22:00:00', '2026-10-05T09:30:00')]);
    expect(map.get('2026-10-04')).toEqual([{ start: 1320, end: 1440 }]);
    expect(map.get('2026-10-05')).toEqual([{ start: 0, end: 570 }]);
  });

  it('un evento de todo el día ocupa los días completos del rango (end.date exclusivo)', () => {
    const map = collectBusyIntervalsByDate([allDayEvent('2026-09-14', '2026-09-16')]);
    expect(map.get('2026-09-14')).toEqual([{ start: 0, end: 1440 }]);
    expect(map.get('2026-09-15')).toEqual([{ start: 0, end: 1440 }]);
    expect(map.has('2026-09-16')).toBe(false);
  });

  it('ignora eventos cancelados, marcados como «disponible» o cuya invitación se rechazó', () => {
    const map = collectBusyIntervalsByDate([
      timedEvent('2026-09-07T08:00:00', '2026-09-07T09:00:00', { status: 'cancelled' }),
      timedEvent('2026-09-07T09:00:00', '2026-09-07T10:00:00', { transparency: 'transparent' }),
      timedEvent('2026-09-07T10:00:00', '2026-09-07T11:00:00', {
        attendees: [{ email: 'tutor@x.co', self: true, responseStatus: 'declined' }],
      }),
      timedEvent('2026-09-07T11:00:00', '2026-09-07T12:00:00', {
        attendees: [{ email: 'tutor@x.co', self: true, responseStatus: 'accepted' }],
      }),
    ]);
    expect(map.get('2026-09-07')).toEqual([{ start: 660, end: 720 }]);
  });
});

describe('deriveFreeBlocksFromBusyEvents', () => {
  it('sin bloques base no hay nada que restar', () => {
    expect(deriveFreeBlocksFromBusyEvents({ baseBlocks: [], events: [], now: NOW })).toEqual([]);
  });

  it('materializa la base menos los eventos como bloques de una sola vez para cada fecha de la ventana', () => {
    const events = [
      timedEvent('2026-09-07T09:00:00', '2026-09-07T10:00:00'),              // parte la base en dos
      allDayEvent('2026-09-14', '2026-09-15'),                                // día completo ocupado
      timedEvent('2026-09-21T08:00:00', '2026-09-21T12:00:00', { transparency: 'transparent' }), // no ocupa
      timedEvent('2026-10-04T22:00:00', '2026-10-05T09:30:00'),              // cruza medianoche
      timedEvent('2026-10-12T08:00:00', '2026-10-12T10:15:00'),              // resto 10:15 → 10:20
      timedEvent('2026-10-19T08:00:00', '2026-10-19T11:05:00'),              // resto 55 min → se descarta
    ];

    const blocks = deriveFreeBlocksFromBusyEvents({
      baseBlocks: [manualBlock()],
      events,
      timeZone: 'America/Bogota',
      now: NOW,
    });

    expect(blocks.map(describeBlock)).toEqual([
      '2026-09-07 08:00-09:00',
      '2026-09-07 10:00-12:00',
      '2026-09-21 08:00-12:00',
      '2026-09-28 08:00-12:00',
      '2026-10-05 09:30-12:00',
      '2026-10-12 10:20-12:00',
      '2026-10-26 08:00-12:00',
      '2026-11-02 08:00-12:00',
    ]);

    for (const b of blocks) {
      expect(b).toMatchObject({ dayOfWeek: 1, recurring: false, source: 'calendar_sync' });
    }
  });

  it('respeta la ventana de sincronización contada en la zona del tutor', () => {
    const blocks = deriveFreeBlocksFromBusyEvents({
      baseBlocks: [manualBlock({ dayOfWeek: 6 })], // sábados
      events: [],
      timeZone: 'America/Bogota',
      now: NOW,
    });
    // Hoy (sábado 5) cuenta como primer día; el sábado 60 días después (4 nov) ya no.
    const dates = blocks.map((b) => b.specificDate.toISOString().substring(0, 10));
    expect(dates[0]).toBe('2026-09-05');
    expect(dates[dates.length - 1]).toBe('2026-10-31');
    expect(SYNC_WINDOW_DAYS).toBe(60);
  });

  it('un bloque base de una sola vez solo produce disponibilidad en su fecha', () => {
    const blocks = deriveFreeBlocksFromBusyEvents({
      baseBlocks: [manualBlock({
        recurring: false,
        specificDate: new Date('2026-09-14T00:00:00.000Z'),
        startTime: time('14:00'),
        endTime: time('16:00'),
      })],
      events: [timedEvent('2026-09-14T15:00:00', '2026-09-14T15:30:00')],
      now: NOW,
    });
    // 14:00–15:00 vale; 15:30–16:00 son 30 min y se descarta.
    expect(blocks.map(describeBlock)).toEqual(['2026-09-14 14:00-15:00']);
  });
});

// ─── Cableado de syncAvailabilityFromCalendar ─────────────────────────────

describe('syncAvailabilityFromCalendar', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    calendarService.getAccessTokenOrRefresh.mockResolvedValue({ accessToken: 'tok', refreshed: false });
    calendarService.listCalendars.mockResolvedValue([{ id: 'cal-1', summary: 'Personal', primary: true }]);
    availabilityRepo.replaceCalendarSyncedAvailability.mockImplementation((_u, blocks) => Promise.resolve(blocks));
    availabilityRepo.upsertSchedule.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('modo ocupado: pide los eventos en la zona del tutor, guarda la base menos los eventos y no toca los manuales', async () => {
    availabilityRepo.findScheduleByUserId.mockResolvedValue({
      userId: USER, calendarSyncId: 'cal-1', calendarSyncMode: 'busy', timezone: 'America/Bogota',
    });
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue([
      manualBlock(),
      // Restos de una sincronización anterior: se reemplazan enteros.
      { id: 'old-sync', dayOfWeek: 1, startTime: time('08:00'), endTime: time('12:00'), recurring: false, specificDate: new Date('2026-08-31T00:00:00.000Z'), source: 'calendar_sync' },
    ]);
    calendarService.listEvents.mockResolvedValue([
      timedEvent('2026-09-07T09:00:00', '2026-09-07T10:00:00'),
    ]);

    const result = await syncAvailabilityFromCalendar(USER, 'access', 'refresh');

    expect(calendarService.listEvents).toHaveBeenCalledWith(
      'tok', 'cal-1', expect.any(String), expect.any(String), { timeZone: 'America/Bogota' },
    );

    const [, saved] = availabilityRepo.replaceCalendarSyncedAvailability.mock.calls[0];
    expect(saved.every((b) => b.source === 'calendar_sync' && b.recurring === false)).toBe(true);
    expect(saved.map(describeBlock).slice(0, 3)).toEqual([
      '2026-09-07 08:00-09:00',
      '2026-09-07 10:00-12:00',
      '2026-09-14 08:00-12:00',
    ]);
    // 9 lunes en la ventana: el primero partido en dos, los demás enteros.
    expect(saved).toHaveLength(10);

    expect(result).toMatchObject({
      mode: 'busy',
      baseBlocks: 1,
      total: 10,
      synced: 10,
      removed: 1,
      warning: null,
      calendarName: 'Personal',
    });
    expect(availabilityRepo.upsertSchedule).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ calendarLastSyncOk: true }),
    );
  });

  it('modo ocupado sin bloques base: no publica nada y avisa', async () => {
    availabilityRepo.findScheduleByUserId.mockResolvedValue({
      userId: USER, calendarSyncId: 'cal-1', calendarSyncMode: 'busy', timezone: 'America/Bogota',
    });
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue([]);
    calendarService.listEvents.mockResolvedValue([timedEvent('2026-09-07T09:00:00', '2026-09-07T10:00:00')]);

    const result = await syncAvailabilityFromCalendar(USER, 'access', 'refresh');

    expect(availabilityRepo.replaceCalendarSyncedAvailability).toHaveBeenCalledWith(USER, []);
    expect(result).toMatchObject({ mode: 'busy', baseBlocks: 0, total: 0, warning: 'NO_BASE_BLOCKS' });
  });

  it('modo disponible: los eventos se importan como bloques y no hay base', async () => {
    availabilityRepo.findScheduleByUserId.mockResolvedValue({
      userId: USER, calendarSyncId: 'cal-1', calendarSyncMode: 'available', timezone: 'America/Bogota',
    });
    availabilityRepo.findAvailabilityByUserId.mockResolvedValue([manualBlock()]);
    calendarService.listEvents.mockResolvedValue([
      timedEvent('2026-09-07T14:00:00', '2026-09-07T16:00:00', { recurringEventId: 'weekly' }),
      timedEvent('2026-09-14T14:00:00', '2026-09-14T16:00:00', { recurringEventId: 'weekly' }),
      timedEvent('2026-09-09T18:00:00', '2026-09-09T19:00:00'),
      allDayEvent('2026-09-10', '2026-09-11'), // sin hora: no es una franja
    ]);

    const result = await syncAvailabilityFromCalendar(USER, 'access', 'refresh');

    const [, saved] = availabilityRepo.replaceCalendarSyncedAvailability.mock.calls[0];
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ dayOfWeek: 1, recurring: true, specificDate: null, source: 'calendar_sync' });
    expect(saved[1]).toMatchObject({ dayOfWeek: 3, recurring: false, source: 'calendar_sync' });
    expect(result).toMatchObject({ mode: 'available', baseBlocks: null, warning: null, total: 2 });
  });
});
