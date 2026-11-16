/**
 * @jest-environment node
 *
 * buildManualSessionSlots is both what the admin form offers and what
 * createManualSession accepts. Pure: real bookable-block rules and time zones.
 */

import { buildManualSessionSlots } from '@/lib/availability/manual-session-slots';

// Monday 2026-11-02, 08:00 in Bogotá (UTC-5).
const NOW = new Date('2026-11-02T13:00:00.000Z');
const MONDAY = 1;

const time = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function block(overrides = {}) {
  return {
    id: 'b1',
    dayOfWeek: MONDAY,
    startTime: time('10:00'),
    endTime: time('13:00'),
    recurring: true,
    specificDate: null,
    source: 'manual',
    ...overrides,
  };
}

function build(overrides = {}) {
  return buildManualSessionSlots({
    blocks: [block()],
    schedule: { timezone: 'America/Bogota', bufferTime: 15, maxSessionsPerDay: 5 },
    sessions: [],
    now: NOW,
    daysAhead: 0,
    ...overrides,
  });
}

const session = (start, end) => ({
  startTimestamp: new Date(start),
  endTimestamp: new Date(end),
});

describe('buildManualSessionSlots', () => {
  it('test_should_offer_hourly_starts_with_the_durations_that_fit_in_the_block', () => {
    const { days, timeZone } = build();

    expect(timeZone).toBe('America/Bogota');
    expect(days).toEqual([
      {
        date: '2026-11-02',
        slots: [
          { startTimestamp: '2026-11-02T15:00:00.000Z', time: '10:00', durations: [60, 90, 120] },
          { startTimestamp: '2026-11-02T16:00:00.000Z', time: '11:00', durations: [60, 90, 120] },
          { startTimestamp: '2026-11-02T17:00:00.000Z', time: '12:00', durations: [60] },
        ],
      },
    ]);
  });

  it('test_should_not_offer_starts_already_past', () => {
    const { days } = build({ now: new Date('2026-11-02T16:30:00.000Z') }); // 11:30 in Bogotá

    expect(days[0].slots.map((s) => s.time)).toEqual(['12:00']);
  });

  it('test_should_leave_the_tutors_buffer_around_an_existing_session', () => {
    // 11:00–12:00 in Bogotá with a 15 min buffer: 10:00 cannot run past 10:45,
    // which is under the minimum, and 12:00 starts inside the buffer.
    const { days } = build({
      sessions: [session('2026-11-02T16:00:00.000Z', '2026-11-02T17:00:00.000Z')],
    });

    expect(days).toEqual([]);
  });

  it('test_should_limit_the_durations_when_a_later_session_cuts_the_slot_short', () => {
    // No buffer and a session at 11:30–12:30 in Bogotá: from 10:00, 120 min would
    // run into it, and 11:00 and 12:00 cannot hold even the shortest one.
    const { days } = build({
      schedule: { timezone: 'America/Bogota', bufferTime: 0 },
      sessions: [session('2026-11-02T16:30:00.000Z', '2026-11-02T17:30:00.000Z')],
    });

    expect(days[0].slots).toEqual([
      { startTimestamp: '2026-11-02T15:00:00.000Z', time: '10:00', durations: [60, 90] },
    ]);
  });

  it('test_should_not_offer_a_day_that_reached_the_tutors_maximum', () => {
    const { days } = build({
      schedule: { timezone: 'America/Bogota', bufferTime: 15, maxSessionsPerDay: 1 },
      sessions: [session('2026-11-02T20:00:00.000Z', '2026-11-02T21:00:00.000Z')], // 15:00 that day
    });

    expect(days).toEqual([]);
  });

  it('test_should_count_the_day_of_a_session_in_the_tutors_time_zone', () => {
    // 02:00 UTC on the 3rd is still the evening of the 2nd in Bogotá.
    const { days } = build({
      schedule: { timezone: 'America/Bogota', bufferTime: 15, maxSessionsPerDay: 1 },
      sessions: [session('2026-11-03T02:00:00.000Z', '2026-11-03T03:00:00.000Z')],
    });

    expect(days).toEqual([]);
  });

  it('test_should_ignore_the_base_blocks_in_busy_sync_mode', () => {
    const { days } = build({
      schedule: { timezone: 'America/Bogota', calendarSyncMode: 'busy' },
      blocks: [
        block(),
        block({ id: 'synced', source: 'calendar_sync', startTime: time('15:00'), endTime: time('16:00') }),
      ],
    });

    expect(days[0].slots.map((s) => s.time)).toEqual(['15:00']);
  });

  it('test_should_offer_a_one_time_block_only_on_its_date', () => {
    const oneTime = block({
      recurring: false,
      specificDate: new Date('2026-11-09T00:00:00.000Z'),
    });

    const { days } = build({ blocks: [oneTime], daysAhead: 14 });

    expect(days.map((d) => d.date)).toEqual(['2026-11-09']);
  });

  it('test_should_not_repeat_a_start_covered_by_two_blocks', () => {
    const { days } = build({
      blocks: [block(), block({ id: 'copy', source: 'calendar_sync', endTime: time('11:00') })],
    });

    expect(days[0].slots.map((s) => s.time)).toEqual(['10:00', '11:00', '12:00']);
    expect(days[0].slots[0].durations).toEqual([60, 90, 120]);
  });

  it('test_should_resolve_the_block_in_the_tutors_time_zone', () => {
    const { days } = build({ schedule: { timezone: 'America/Mexico_City' } }); // UTC-6 in November

    expect(days[0].slots[0]).toEqual({
      startTimestamp: '2026-11-02T16:00:00.000Z',
      time: '10:00',
      durations: [60, 90, 120],
    });
  });

  it('test_should_return_no_days_when_the_tutor_has_no_blocks', () => {
    expect(build({ blocks: [] }).days).toEqual([]);
  });
});
