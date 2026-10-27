/**
 * Booking refusal codes shared by the session service, the checkout routes and
 * the Wompi webhook. Pure module (no imports) so routes and their tests can
 * read it without pulling Prisma in.
 *
 * - SLOT_POLICY_CODES: slot rules (1 h length, allowed start minutes, inside
 *   the tutor's availability, max sessions per day). They are enforced BEFORE
 *   charging (create-intent) and relaxed AFTER the charge (paid fulfilment):
 *   a payment Wompi already approved must not be stranded because a tutor
 *   re-synced their calendar between checkout and approval.
 * - BOOKING_REFUSAL_CODES: every refusal the booking checks can raise. Before
 *   charging they answer 409; after charging the hard ones that remain
 *   (SELF_BOOKING, TUTOR_NOT_APPROVED, SESSION_CONFLICT) mean "paid but not
 *   booked" → manual refund / reschedule.
 * - PAID_NOT_BOOKED_CODES: refusals after an approved charge that need a human.
 */

export const SLOT_POLICY_CODES = Object.freeze([
  'INVALID_TIMES',
  'INVALID_DURATION',
  'OUTSIDE_AVAILABILITY',
  'MAX_SESSIONS_REACHED',
]);

export const BOOKING_REFUSAL_CODES = Object.freeze([
  'SELF_BOOKING',
  'TUTOR_NOT_APPROVED',
  'SESSION_CONFLICT',
  ...SLOT_POLICY_CODES,
]);

export const PAID_NOT_BOOKED_CODES = Object.freeze([
  ...BOOKING_REFUSAL_CODES,
  'AMOUNT_MISMATCH',
  'COUPON_LIMIT_EXCEEDED',
  'INTENT_CONSUMED',
]);

export function isBookingRefusal(err) {
  return BOOKING_REFUSAL_CODES.includes(err?.code);
}

export function isPaidNotBooked(err) {
  return PAID_NOT_BOOKED_CODES.includes(err?.code);
}
