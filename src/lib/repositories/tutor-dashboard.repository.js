/**
 * Tutor Dashboard Repository
 * The minimal rows the tutor home needs to compute its own figures: this
 * tutor's sessions and the payments of those sessions. Scoped to one tutor,
 * so the lists stay small; the arithmetic lives in tutor-dashboard.service.
 */

import prisma from '../prisma';

/** Every session of the tutor that was not canceled or rejected; one course when given. */
export async function findTutorSessions(tutorId, { courseId = null } = {}) {
  return prisma.session.findMany({
    where: { tutorId, status: { notIn: ['Canceled', 'Rejected'] }, ...(courseId ? { courseId } : {}) },
    select: {
      id: true,
      status: true,
      startTimestamp: true,
      endTimestamp: true,
      participants: { select: { studentId: true } },
    },
  });
}

/**
 * The tutor's payments (of one course when given), with what tutorPayoutStateOf needs. Explicit select:
 * the Wompi id, the proof and the admin's payout note stay out.
 */
export async function findTutorPayments(tutorId, { courseId = null } = {}) {
  return prisma.payment.findMany({
    where: { tutorId, ...(courseId ? { session: { courseId } } : {}) },
    select: {
      id: true,
      amount: true,
      tutorPayoutBase: true,
      status: true,
      tutorPayoutStatus: true,
      session: {
        select: {
          status: true,
          startTimestamp: true,
          endTimestamp: true,
          course: { select: { code: true } },
        },
      },
    },
  });
}
