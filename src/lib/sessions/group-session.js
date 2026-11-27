/**
 * Group tutoring rules. Client-safe (no server imports): the booking form
 * offers exactly what the server accepts.
 *
 *  - Whoever books pays for every seat and invites the others by email
 *    (src/lib/services/session-invitation.service.js). Guests join for free.
 *  - Up to 6 people per session, counting the one who books. Each tutor can
 *    lower it with `schedules.max_group_size` (1 = no group sessions;
 *    default 6: everyone accepts groups).
 *  - Each extra person adds 10 000 COP per hour to the session price
 *    (1 h 30 with 3 people = 2 × 10 000 × 1.5 = 30 000). The surcharge is part
 *    of the list price, so the 85/15 split applies to it like to the rest.
 *  - Coupons only discount the base price, never the surcharge
 *    (`withSurcharge` in src/lib/payments/coupon-math.js).
 */

export const GROUP_MAX_SIZE = 6;
export const GROUP_SURCHARGE_PER_HOUR_COP = 10_000;

/** How many times an invitation email can be sent to the same address. */
export const INVITATION_MAX_SENDS = 3;
/** Minutes before an invitation can be re-sent. */
export const INVITATION_RESEND_COOLDOWN_MINUTES = 5;
/** Distinct addresses a session can ever invite: replacing guests is not a mail cannon. */
export const INVITATION_MAX_PER_SESSION = (GROUP_MAX_SIZE - 1) * 3;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;

/** A tutor's cap (1..6), falling back to the default for unknown or missing values. */
export function maxGroupSizeOf(schedule) {
  const value = Number(schedule?.maxGroupSize);
  return Number.isInteger(value) && value >= 1 && value <= GROUP_MAX_SIZE ? value : GROUP_MAX_SIZE;
}

/** People in the booking (1 = individual). Anything that is not an integer ≥ 1 reads as 1. */
export function normalizeGroupSize(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/** Whether `groupSize` people can book a tutor who accepts up to `maxGroupSize`. */
export function isAllowedGroupSize(groupSize, maxGroupSize = GROUP_MAX_SIZE) {
  return Number.isInteger(groupSize) && groupSize >= 1 && groupSize <= Math.min(maxGroupSize, GROUP_MAX_SIZE);
}

/**
 * Surcharge (integer COP) for a booking of `groupSize` people lasting `hours`.
 * 0 for an individual session.
 */
export function groupSurcharge({ groupSize, hours }) {
  const extra = normalizeGroupSize(groupSize) - 1;
  const h = Number(hours);
  if (extra <= 0 || !Number.isFinite(h) || h <= 0) return 0;
  return Math.round(extra * GROUP_SURCHARGE_PER_HOUR_COP * h);
}

/** Trim + lowercase. Does NOT validate. */
export function normalizeEmail(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(email);
}

/**
 * Clean a list of guest emails typed by the organiser.
 *
 * @param {unknown} raw
 * @param {{ maxGuests: number, exclude?: string[] }} options `exclude`: addresses
 *   that cannot be invited (the organiser, the tutor).
 * @returns {{ emails: string[], error: null | 'INVITE_INVALID_EMAIL' | 'INVITE_DUPLICATE' | 'INVITE_SELF' | 'INVITE_TOO_MANY' }}
 */
export function cleanInviteEmails(raw, { maxGuests, exclude = [] } = {}) {
  if (raw == null) return { emails: [], error: null };
  if (!Array.isArray(raw)) return { emails: [], error: 'INVITE_INVALID_EMAIL' };

  const blocked = new Set(exclude.map(normalizeEmail).filter(Boolean));
  const seen = new Set();
  const emails = [];
  for (const item of raw) {
    const email = normalizeEmail(item);
    if (!email) continue; // empty rows of the form are just skipped
    if (!isValidEmail(email)) return { emails: [], error: 'INVITE_INVALID_EMAIL' };
    if (blocked.has(email)) return { emails: [], error: 'INVITE_SELF' };
    if (seen.has(email)) return { emails: [], error: 'INVITE_DUPLICATE' };
    seen.add(email);
    emails.push(email);
  }
  if (emails.length > Math.max(0, Number(maxGuests) || 0)) return { emails: [], error: 'INVITE_TOO_MANY' };
  return { emails, error: null };
}

// ─── Payment-intent snapshot ─────────────────────────────────────────────
// Frozen into the intent metadata next to the coupon snapshot
// (src/lib/payments/coupon-math.js). Strings: Wompi metadata is string-typed.

/** Metadata keys of a group booking; nothing is added for an individual one. */
export function buildGroupSnapshot({ groupSize, groupSurcharge: surcharge, inviteEmails = [] }) {
  const size = normalizeGroupSize(groupSize);
  if (size <= 1) return {};
  return {
    groupSize: String(size),
    groupSurcharge: String(Math.max(0, Math.round(Number(surcharge) || 0))),
    inviteEmails: JSON.stringify(inviteEmails),
  };
}

/**
 * Read the group part of an intent back. Individual bookings (and every
 * intent created before group sessions existed) read as size 1, no surcharge.
 * @returns {{ groupSize: number, groupSurcharge: number, inviteEmails: string[] }}
 */
export function readGroupSnapshot(metadata) {
  const size = Math.min(GROUP_MAX_SIZE, normalizeGroupSize(metadata?.groupSize));
  if (size <= 1) return { groupSize: 1, groupSurcharge: 0, inviteEmails: [] };

  const surcharge = Math.round(Number(metadata.groupSurcharge));
  let emails = [];
  try {
    const parsed = JSON.parse(metadata.inviteEmails ?? '[]');
    if (Array.isArray(parsed)) emails = parsed.map(normalizeEmail).filter(isValidEmail);
  } catch {
    emails = [];
  }
  return {
    groupSize: size,
    groupSurcharge: Number.isFinite(surcharge) && surcharge > 0 ? surcharge : 0,
    inviteEmails: [...new Set(emails)].slice(0, size - 1),
  };
}

// ─── Who is who in a session ─────────────────────────────────────────────

/**
 * The student who booked (and paid for) a session: the only student who can
 * cancel it, manage its invitations and see what was charged. Falls back to
 * the first participant (sessions are read oldest participant first) for
 * rows without a payment.
 */
export function organizerIdOf(session) {
  return session?.payments?.[0]?.studentId ?? session?.participants?.[0]?.studentId ?? null;
}

export function isGroupSession(session) {
  return session?.sessionType === 'Group';
}
