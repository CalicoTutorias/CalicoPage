/**
 * How the student paid a session. Pure: shared by the payouts repository, which
 * counts them per tutor, and the service, which labels each payment.
 *
 *   manual   — a session an admin recorded, paid outside the platform
 *   wompi    — charged through Wompi
 *   courtesy — a 100 % coupon: nothing charged, the tutor is still owed
 *
 * @param {{ wompiId?: string|null, session?: { source?: string } }} payment
 * @returns {'manual'|'wompi'|'courtesy'}
 */
export function paymentTypeOf(payment) {
  if (payment.session?.source === 'ManualAdmin') return 'manual';
  return payment.wompiId ? 'wompi' : 'courtesy';
}
