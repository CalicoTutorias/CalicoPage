/**
 * Where a tutor's money stands for one payment, as the tutor sees it. Decided on
 * the server so the tutor and "Pagos a tutores" cannot disagree: `owed` is exactly
 * what the admin list shows as pending (payouts.repository.payableSessionWhere;
 * an integration test checks both give the same answer).
 *
 *   paid             — Calico already transferred it
 *   owed             — the student paid and the session happened: on its way
 *   upcoming         — the student paid, the session is still to come
 *   awaiting_student — a manual session the student has not paid yet
 *   canceled         — the session was canceled or rejected: nothing is owed
 *   failed           — the charge failed
 *   not_applicable   — a test course, which no money view counts
 */

import { METRICS_EXCLUDED_COURSE_CODES } from '../repositories/metrics-exclusions';

export const TUTOR_PAYOUT_STATES = Object.freeze({
  PAID: 'paid',
  OWED: 'owed',
  UPCOMING: 'upcoming',
  AWAITING_STUDENT: 'awaiting_student',
  CANCELED: 'canceled',
  FAILED: 'failed',
  NOT_APPLICABLE: 'not_applicable',
});

const CLOSED_SESSION_STATUSES = new Set(['Canceled', 'Rejected']);

function sessionHappened(session, now) {
  if (session.status === 'Completed') return true;
  return session.status === 'Accepted' && new Date(session.endTimestamp).getTime() < now.getTime();
}

/**
 * @param {{ status: string, tutorPayoutStatus: string, session?: {
 *   status: string, endTimestamp: Date|string, course?: { code?: string },
 * } }} payment
 * @param {Date} [now]
 * @returns {string} one of TUTOR_PAYOUT_STATES
 */
export function tutorPayoutStateOf(payment, now = new Date()) {
  const { PAID, OWED, UPCOMING, AWAITING_STUDENT, CANCELED, FAILED, NOT_APPLICABLE } = TUTOR_PAYOUT_STATES;
  const { session } = payment;

  // A transfer already made stands, whatever happens to the session afterwards.
  if (payment.tutorPayoutStatus === 'paid') return PAID;
  if (payment.status === 'failed') return FAILED;
  if (!session || CLOSED_SESSION_STATUSES.has(session.status)) return CANCELED;
  if (METRICS_EXCLUDED_COURSE_CODES.includes(session.course?.code)) return NOT_APPLICABLE;
  if (payment.status !== 'paid') return AWAITING_STUDENT;
  return sessionHappened(session, now) ? OWED : UPCOMING;
}
