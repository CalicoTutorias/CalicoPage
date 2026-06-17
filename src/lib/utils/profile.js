/**
 * Profile completeness helpers.
 *
 * Google OAuth sign-up only yields email + name, so phone and career are left
 * empty. These helpers are the SINGLE source of truth for "is this profile
 * complete?", consumed by both the soft banner and the post-login redirect so
 * the two never drift apart.
 *
 * Tolerant of both user shapes in the app:
 *   - the auth-context user  → { phone, careerId }
 *   - a raw API/Prisma user  → { phoneNumber, careerId }
 */

/** @param {Object|null|undefined} user */
export function hasPhone(user) {
  const phone = user?.phone ?? user?.phoneNumber;
  return typeof phone === 'string' && phone.trim().length > 0;
}

/** @param {Object|null|undefined} user */
export function hasCareer(user) {
  const careerId = user?.careerId ?? user?.career?.id ?? null;
  return typeof careerId === 'string' && careerId.trim().length > 0;
}

/**
 * A profile is complete once the user has supplied the two fields the regular
 * registration form collects but Google sign-up does not: phone and career.
 * @param {Object|null|undefined} user
 * @returns {boolean}
 */
export function isProfileComplete(user) {
  return hasPhone(user) && hasCareer(user);
}
