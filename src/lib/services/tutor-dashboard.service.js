/**
 * Tutor Dashboard Service
 *
 * The figures on the tutor home, computed on the server so they follow the
 * same rules as the admin views:
 *  - A session counts as held when it is Completed, or Accepted and already
 *    over (no screen marks sessions Completed; same rule as payouts and
 *    metrics-exclusions.heldSession).
 *  - Money is what the tutor earns: their share (fees.tutorPayout) of the
 *    payout base, only for payments whose tutorPayoutState is `paid` or `owed`
 *    (the student paid and the session happened). Test courses never count.
 *  - "This week" runs Monday 00:00 to Sunday 24:00 in Bogotá.
 */

import * as repo from '../repositories/tutor-dashboard.repository';
import { tutorPayout } from '../payments/fees';
import { tutorPayoutStateOf, TUTOR_PAYOUT_STATES } from '../payments/tutor-payout-state';

const BOGOTA_OFFSET_MS = 5 * 60 * 60_000; // UTC-5 all year, no daylight saving
const DAY_MS = 24 * 60 * 60_000;
const EARNED_STATES = new Set([TUTOR_PAYOUT_STATES.PAID, TUTOR_PAYOUT_STATES.OWED]);

/** Monday 00:00 in Bogotá of the week `now` falls in, and the Monday after. */
export function bogotaWeekRange(now = new Date()) {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const mondayLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday);
  const start = new Date(mondayLocal + BOGOTA_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

function isHeld(session, now) {
  if (session.status === 'Completed') return true;
  return session.status === 'Accepted' && new Date(session.endTimestamp).getTime() < now.getTime();
}

function inRange(date, { start, end }) {
  const t = new Date(date).getTime();
  return t >= start.getTime() && t < end.getTime();
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @returns {Promise<{
 *   scheduled: number, held: number, totalEarnings: number,
 *   weeklySessions: number, weeklyEarnings: number,
 *   studentRetention: number|null,
 * }>} studentRetention is a whole percentage, or null with no student yet.
 * With `courseId`, every figure covers that course only (the course page).
 */
export async function getTutorDashboardStats(tutorId, { now = new Date(), courseId = null } = {}) {
  const [sessions, payments] = await Promise.all([
    repo.findTutorSessions(tutorId, { courseId }),
    repo.findTutorPayments(tutorId, { courseId }),
  ]);
  const week = bogotaWeekRange(now);

  const held = sessions.filter((s) => isHeld(s, now));
  const scheduled = sessions.filter(
    (s) => ['Pending', 'Accepted'].includes(s.status) && new Date(s.endTimestamp).getTime() >= now.getTime(),
  );

  // Every session of this week that still stands: held ones and those to come.
  const weeklySessions = sessions.filter((s) => inRange(s.startTimestamp, week)).length;

  let totalEarnings = 0;
  let weeklyEarnings = 0;
  for (const payment of payments) {
    if (!EARNED_STATES.has(tutorPayoutStateOf(payment, now))) continue;
    const share = tutorPayout(Number(payment.tutorPayoutBase ?? payment.amount));
    totalEarnings += share;
    if (inRange(payment.session.startTimestamp, week)) weeklyEarnings += share;
  }

  // Of the students who already had a session with this tutor, how many came back.
  const heldByStudent = new Map();
  for (const session of held) {
    for (const { studentId } of session.participants) {
      heldByStudent.set(studentId, (heldByStudent.get(studentId) ?? 0) + 1);
    }
  }
  const students = heldByStudent.size;
  const returning = [...heldByStudent.values()].filter((n) => n >= 2).length;

  return {
    scheduled: scheduled.length,
    held: held.length,
    totalEarnings: round2(totalEarnings),
    weeklySessions,
    weeklyEarnings: round2(weeklyEarnings),
    studentRetention: students > 0 ? Math.round((returning / students) * 100) : null,
  };
}
