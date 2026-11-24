import {
  DEFAULT_MAX_HOURS_PER_DAY, durationsUpTo, isAllowedDuration, maxHoursPerDayOf, maxSessionMinutesOf,
} from '@/lib/sessions/session-duration';
import { SlotService } from '@/app/services/utils/SlotService';

describe('session-duration rules', () => {
  it('offers 1 h, 1 h 30 and 2 h; by default every tutor accepts all three', () => {
    expect(durationsUpTo(maxSessionMinutesOf(null))).toEqual([60, 90, 120]);
    expect(durationsUpTo(60)).toEqual([60]);
    expect(durationsUpTo(90)).toEqual([60, 90]);
  });

  it('only the offered lengths are allowed, within the cap', () => {
    expect(isAllowedDuration(90, 120)).toBe(true);
    expect(isAllowedDuration(120, 90)).toBe(false);
    expect(isAllowedDuration(75, 120)).toBe(false);
  });

  it('falls back to the defaults for unknown values', () => {
    expect(maxSessionMinutesOf({ maxSessionMinutes: 45 })).toBe(120);
    expect(maxHoursPerDayOf({ maxHoursPerDay: 0 })).toBe(DEFAULT_MAX_HOURS_PER_DAY);
    expect(maxHoursPerDayOf({ maxHoursPerDay: 8 })).toBe(8);
  });
});

describe('SlotService.generateHourlySlots by duration', () => {
  const window = { id: 'w', tutorId: 't', startDateTime: '2026-11-24T08:00:00', endDateTime: '2026-11-24T12:00:00' };
  const times = (slots) => slots.map((s) => [new Date(s.startDateTime).getHours(), new Date(s.endDateTime).getHours() + new Date(s.endDateTime).getMinutes() / 60]);

  it('1 h: one slot per hour (unchanged behaviour)', () => {
    expect(times(SlotService.generateHourlySlots(window))).toEqual([[8, 9], [9, 10], [10, 11], [11, 12]]);
  });

  it('2 h: starts every hour while the whole session fits', () => {
    expect(times(SlotService.generateHourlySlots(window, 120))).toEqual([[8, 10], [9, 11], [10, 12]]);
  });

  it('1 h 30: the last start leaves room for 90 minutes', () => {
    expect(times(SlotService.generateHourlySlots(window, 90))).toEqual([[8, 9.5], [9, 10.5], [10, 11.5]]);
  });

  it('a window shorter than the session yields nothing', () => {
    expect(SlotService.generateHourlySlots({ ...window, endDateTime: '2026-11-24T09:30:00' }, 120)).toEqual([]);
  });

  it('a tutor who caps sessions below the length yields nothing', () => {
    expect(SlotService.generateHourlySlots({ ...window, maxSessionMinutes: 60 }, 90)).toEqual([]);
  });
});
