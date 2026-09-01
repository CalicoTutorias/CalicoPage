/**
 * Pending-booking handoff for anonymous visitors.
 *
 * When someone who isn't logged in picks a slot, the fully-serialized booking
 * URL (/home/agendar?tutorId=...) is stashed here before sending them through
 * login / registration / email verification. Whichever auth surface completes
 * the session consumes it and drops the user straight back into their booking.
 *
 * localStorage (not sessionStorage) on purpose: the email-verification link
 * opens in a NEW tab, and sessionStorage is per-tab. Entries expire after
 * PENDING_BOOKING_TTL_MS — slots are near-term and a stale redirect to a dead
 * slot is worse than no redirect.
 *
 * Security: values are sanitized on write AND on read (localStorage is
 * user/extension-writable), so a tampered entry can never become an external
 * redirect. All storage access is wrapped — private mode / blocked storage
 * degrades to the ?returnTo= query-param mechanism.
 */

import { sanitizeReturnTo } from '../../../lib/utils/returnTo';

const STORAGE_KEY = 'calico_pending_booking';
export const PENDING_BOOKING_TTL_MS = 45 * 60 * 1000; // 45 min

export function savePendingBooking(url) {
  const safe = sanitizeReturnTo(url);
  if (!safe || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: safe, savedAt: Date.now() }),
    );
  } catch {
    // Storage unavailable — the ?returnTo= param still covers the direct path.
  }
}

/**
 * Pure read of the pending booking URL — no cleanup side effects, so it is
 * safe as a useSyncExternalStore snapshot (called during render).
 * @returns {string|null}
 */
export function readPendingBooking() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { url, savedAt } = JSON.parse(raw);
    const fresh =
      typeof savedAt === 'number' && Date.now() - savedAt <= PENDING_BOOKING_TTL_MS;
    return fresh ? sanitizeReturnTo(url) : null;
  } catch {
    return null;
  }
}

/**
 * Read the pending booking URL without consuming it. Unlike readPendingBooking
 * this also purges expired / corrupted / unsafe leftovers from storage.
 * @returns {string|null}
 */
export function peekPendingBooking() {
  if (typeof window === 'undefined') return null;
  const safe = readPendingBooking();
  if (!safe) clearPendingBooking();
  return safe;
}

/**
 * Read AND clear the pending booking URL. Call this exactly when an auth flow
 * completes and is about to navigate — never on passive page loads, so an old
 * entry can't hijack an unrelated visit.
 * @returns {string|null}
 */
export function consumePendingBooking() {
  const url = peekPendingBooking();
  clearPendingBooking();
  return url;
}

export function clearPendingBooking() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — storage is unavailable altogether.
  }
}
