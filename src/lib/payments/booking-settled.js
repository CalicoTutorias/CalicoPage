/**
 * A paid booking is settled once the request that booked it finished its
 * Google Calendar step: it stored the Meet link, or it already wrote the
 * payment row (written after that step, also when Calendar failed). Until
 * then a concurrent request (webhook vs confirm-payment, status polling) must
 * not report the session as confirmed, or the student sees it without its
 * Meet link. Pure: safe to import anywhere.
 *
 * @param {object|null} session - session loaded with SESSION_INCLUDE (payments)
 * @returns {boolean}
 */
export function isPaidBookingSettled(session) {
  return Boolean(session?.googleMeetLink) || (session?.payments?.length ?? 0) > 0;
}
