/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/utils/validation.js`.
 *
 * These rules are enforced identically on the client and the server, so the
 * tests double as the spec for the password policy and the email/phone/name
 * format checks. Each branch (including the null/undefined coercion) is pinned.
 */

const {
  sanitizePhoneDigits,
  isValidPhoneLocal,
  normalizeEmail,
  isValidEmail,
  stripWhitespace,
  getPasswordIssues,
  isValidPassword,
  sanitizeName,
  isValidName,
  PASSWORD_MIN_LENGTH,
} = require('@/lib/utils/validation');

describe('phone helpers', () => {
  it('sanitizePhoneDigits keeps only digits', () => {
    expect(sanitizePhoneDigits('+57 (300) 123-4567')).toBe('573001234567');
  });

  it('sanitizePhoneDigits coerces null/undefined to an empty string', () => {
    expect(sanitizePhoneDigits(null)).toBe('');
    expect(sanitizePhoneDigits(undefined)).toBe('');
  });

  it('isValidPhoneLocal accepts 7–15 digit numbers', () => {
    expect(isValidPhoneLocal('1234567')).toBe(true);       // 7 → min
    expect(isValidPhoneLocal('300123456789012')).toBe(true); // 15 → max
  });

  it('isValidPhoneLocal rejects numbers outside the 7–15 range', () => {
    expect(isValidPhoneLocal('123456')).toBe(false);        // 6 → too short
    expect(isValidPhoneLocal('3001234567890123')).toBe(false); // 16 → too long
  });
});

describe('email helpers', () => {
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Tutor@Calico.COM  ')).toBe('tutor@calico.com');
  });

  it('isValidEmail accepts a well-formed address (after normalization)', () => {
    expect(isValidEmail('  Student@Uni.edu.co ')).toBe(true);
  });

  it.each([
    ['no-at-sign', 'plainaddress'],
    ['no domain dot', 'user@localhost'],
    ['spaces', 'a b@x.com'],
    ['empty', ''],
    ['null', null],
  ])('isValidEmail rejects %s', (_label, value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(isValidPassword('Abc!23')).toBe(true);
    expect(getPasswordIssues('Abc!23')).toEqual([]);
  });

  it('flags exactly the rules that fail', () => {
    // "abc" → too short, no uppercase, no special char (spaces rule ok)
    const issues = getPasswordIssues('abc');
    expect(issues).toEqual(expect.arrayContaining(['minLength', 'uppercase', 'special']));
    expect(issues).not.toContain('noSpaces');
  });

  it('rejects passwords containing whitespace', () => {
    expect(getPasswordIssues('Abc! 2')).toContain('noSpaces');
    expect(isValidPassword('Abc! 2')).toBe(false);
  });

  it('enforces the documented minimum length', () => {
    const tooShort = 'A!1'.padEnd(PASSWORD_MIN_LENGTH - 1, 'b').slice(0, PASSWORD_MIN_LENGTH - 1);
    expect(getPasswordIssues(tooShort)).toContain('minLength');
  });

  it('coerces null/undefined to a fully-failing password (no crash)', () => {
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });

  it('stripWhitespace removes all whitespace characters', () => {
    expect(stripWhitespace('A b\tc\n')).toBe('Abc');
    expect(stripWhitespace(null)).toBe('');
  });
});

describe('name helpers', () => {
  it('sanitizeName trims and collapses internal whitespace runs', () => {
    expect(sanitizeName('  Juan   Carlos  Pérez ')).toBe('Juan Carlos Pérez');
  });

  it('isValidName accepts a 1–100 char name', () => {
    expect(isValidName('A')).toBe(true);
    expect(isValidName('x'.repeat(100))).toBe(true);
  });

  it('isValidName rejects empty/whitespace-only and over-long names', () => {
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('x'.repeat(101))).toBe(false);
    expect(isValidName(null)).toBe(false);
  });
});
