/**
 * Universities whose email domain earns the "verified student/tutor" badge.
 * Client-safe (no server imports): the profile form uses it to validate the
 * domain before calling the API, and the API re-checks with the same list.
 *
 * To add a university: one entry here. `code` is what is stored in
 * `users.verified_university` and shown publicly — never the email itself.
 */

export const UNIVERSITIES = Object.freeze([
  Object.freeze({
    code: 'uniandes',
    name: 'Universidad de los Andes',
    shortName: 'Uniandes',
    domains: Object.freeze(['uniandes.edu.co']),
  }),
]);

/**
 * In-app notification type that invites a user to verify their university
 * email. Here (client-safe) so the notification dropdown and the server share it.
 */
export const UNIVERSITY_VERIFICATION_TYPE = 'university_verification_reminder';

/** Lowercased, trimmed email; '' for anything that is not a string. */
export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * The university an email belongs to, by exact domain match (no subdomains,
 * so `x@alumni.uniandes.edu.co` does not count). null when none.
 */
export function universityForEmail(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  const domain = normalized.slice(at + 1);
  return UNIVERSITIES.find((u) => u.domains.includes(domain)) ?? null;
}

/** University by its stored code; null for unknown or empty codes. */
export function universityByCode(code) {
  if (!code) return null;
  return UNIVERSITIES.find((u) => u.code === code) ?? null;
}
