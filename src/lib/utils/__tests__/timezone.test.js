/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/utils/timezone.js`.
 *
 * Colombia is a fixed UTC-5 (no DST), so the conversion logic is deterministic.
 * The strongest assertions here verify the actual UTC→Bogotá shift — including
 * a case that crosses the day boundary — rather than locale-formatted strings,
 * which depend on the runtime's ICU data and would be brittle.
 */

const {
  formatColombiaDateTime,
  formatColombiaDate,
  formatColombiaTme,
  getColombiaTmeComponents,
  convertUTCToColombiaTime,
  formatColombiaTmmeOnly,
} = require('@/lib/utils/timezone');

// 02:30:45 UTC on Mar 15 → 21:30:45 on Mar 14 in Bogotá (UTC-5).
const UTC_INSTANT = '2026-03-15T02:30:45Z';

describe('getColombiaTmeComponents', () => {
  it('shifts a UTC instant back 5 hours, crossing the day boundary', () => {
    expect(getColombiaTmeComponents(UTC_INSTANT)).toEqual({
      year: 2026,
      month: 3,
      day: 14,
      hour: 21,
      minute: 30,
      second: 45,
    });
  });

  it('accepts a Date object as well as a string', () => {
    const fromDate = getColombiaTmeComponents(new Date(UTC_INSTANT));
    expect(fromDate.day).toBe(14);
    expect(fromDate.hour).toBe(21);
  });

  it('returns null for empty or invalid input', () => {
    expect(getColombiaTmeComponents('')).toBeNull();
    expect(getColombiaTmeComponents(null)).toBeNull();
    expect(getColombiaTmeComponents('not-a-date')).toBeNull();
  });
});

describe('convertUTCToColombiaTime', () => {
  it('returns a Date shifted exactly 5 hours earlier', () => {
    const original = new Date(UTC_INSTANT).getTime();
    const converted = convertUTCToColombiaTime(UTC_INSTANT);
    expect(converted).toBeInstanceOf(Date);
    expect(original - converted.getTime()).toBe(5 * 60 * 60 * 1000);
  });

  it('returns null for empty or invalid input', () => {
    expect(convertUTCToColombiaTime(null)).toBeNull();
    expect(convertUTCToColombiaTime('garbage')).toBeNull();
  });
});

describe('format helpers (robust, locale-agnostic assertions)', () => {
  it.each([
    ['formatColombiaDateTime', formatColombiaDateTime],
    ['formatColombiaDate', formatColombiaDate],
    ['formatColombiaTme', formatColombiaTme],
  ])('%s returns an empty string for empty/invalid input', (_name, fn) => {
    expect(fn('')).toBe('');
    expect(fn(null)).toBe('');
    expect(fn('not-a-date')).toBe('');
  });

  it('formatColombiaDateTime and formatColombiaDate include the year for a valid date', () => {
    expect(formatColombiaDateTime(UTC_INSTANT)).toContain('2026');
    expect(formatColombiaDate(UTC_INSTANT)).toContain('2026');
  });

  it('formatColombiaTme returns a non-empty time string for a valid date', () => {
    expect(formatColombiaTme(UTC_INSTANT).length).toBeGreaterThan(0);
  });

  it('legacy formatColombiaTmmeOnly delegates to formatColombiaTme', () => {
    expect(formatColombiaTmmeOnly(UTC_INSTANT)).toBe(formatColombiaTme(UTC_INSTANT));
  });
});
