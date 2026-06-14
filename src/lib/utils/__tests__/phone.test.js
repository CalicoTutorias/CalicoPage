/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/utils/phone.js` — the split/join used by the
 * registration and apply-tutor forms to round-trip the stored
 * "<dialCode> <local>" phone format.
 */

const {
  splitPhone,
  joinPhone,
  DEFAULT_PHONE_COUNTRY_CODE,
} = require('@/lib/utils/phone');

describe('splitPhone', () => {
  it('returns the default code and empty local for falsy input', () => {
    expect(splitPhone('')).toEqual({ code: DEFAULT_PHONE_COUNTRY_CODE, local: '' });
    expect(splitPhone(null)).toEqual({ code: DEFAULT_PHONE_COUNTRY_CODE, local: '' });
  });

  it('splits a stored "+57 <local>" string', () => {
    expect(splitPhone('+57 3001234567')).toEqual({ code: '+57', local: '3001234567' });
  });

  it('matches the longest dial code (e.g. +507, not a shorter prefix)', () => {
    expect(splitPhone('+507 61234567')).toEqual({ code: '+507', local: '61234567' });
  });

  it('trims surrounding whitespace around the number', () => {
    expect(splitPhone('  +1 5551234567  ')).toEqual({ code: '+1', local: '5551234567' });
  });

  it('falls back to the default code and keeps the whole string as local when no code matches', () => {
    expect(splitPhone('3001234567')).toEqual({
      code: DEFAULT_PHONE_COUNTRY_CODE,
      local: '3001234567',
    });
  });
});

describe('joinPhone', () => {
  it('concatenates code and local with a single space', () => {
    expect(joinPhone('+57', '3001234567')).toBe('+57 3001234567');
  });

  it('trims the local part before joining', () => {
    expect(joinPhone('+1', '  5551234  ')).toBe('+1 5551234');
  });

  it('returns an empty string when local is empty/whitespace (never persists a bare code)', () => {
    expect(joinPhone('+57', '')).toBe('');
    expect(joinPhone('+57', '   ')).toBe('');
    expect(joinPhone('+57', null)).toBe('');
  });

  it('round-trips with splitPhone', () => {
    const stored = joinPhone('+57', '3001234567');
    expect(splitPhone(stored)).toEqual({ code: '+57', local: '3001234567' });
  });
});
