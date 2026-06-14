/**
 * Shared input validation + sanitization helpers.
 *
 * Framework-free on purpose (no zod import) so it can be used both in client
 * components (cheap to bundle) and inside server-side zod `.refine()` calls.
 *
 * SQL injection is NOT a concern in this codebase (all DB access goes through
 * Prisma, which parameterizes every query). These helpers exist to enforce
 * data-quality / format rules and a consistent password policy across the
 * registration, password-reset and tutor-application flows.
 */

// ─── Phone ──────────────────────────────────────────────────────────────────

export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15; // E.164 max national number length

/** Strip everything that is not a digit (use as you-type filter). */
export function sanitizePhoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** A local phone number is 7–15 digits (country code handled separately). */
export function isValidPhoneLocal(value) {
  const digits = sanitizePhoneDigits(value);
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS;
}

// ─── Email ──────────────────────────────────────────────────────────────────

// Pragmatic email shape: something@something.tld, no spaces. The server still
// runs zod's stricter .email(), this is just for fast client feedback.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(value) {
  return EMAIL_REGEX.test(normalizeEmail(value));
}

// ─── Password ───────────────────────────────────────────────────────────────
//
// Policy (decided with the product owner): min 6 chars, ≥1 uppercase letter,
// ≥1 special character, and NO whitespace. Enforced identically on the client
// and the server so the API is safe even if the UI is bypassed.

export const PASSWORD_MIN_LENGTH = 12;

/** Individual rules — reused by the UI checklists so labels stay in sync. */
export const PASSWORD_RULES = [
  { key: 'minLength', test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { key: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { key: 'special', test: (p) => /[^A-Za-z0-9]/.test(p) },
  { key: 'noSpaces', test: (p) => p.length > 0 && !/\s/.test(p) },
];

/** Remove any whitespace (use as you-type filter on password inputs). */
export function stripWhitespace(value) {
  return String(value ?? '').replace(/\s/g, '');
}

/** @returns {string[]} keys of the rules that FAIL (empty array = valid). */
export function getPasswordIssues(password) {
  const p = String(password ?? '');
  return PASSWORD_RULES.filter((r) => !r.test(p)).map((r) => r.key);
}

export function isValidPassword(password) {
  return getPasswordIssues(password).length === 0;
}

// ─── Name ───────────────────────────────────────────────────────────────────

export const NAME_MAX_LENGTH = 100;

/** Trim and collapse internal whitespace runs to a single space. */
export function sanitizeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function isValidName(value) {
  const n = sanitizeName(value);
  return n.length >= 1 && n.length <= NAME_MAX_LENGTH;
}
