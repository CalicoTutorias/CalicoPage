/**
 * Session Package Repository
 * Prisma wrappers for SessionPackage (paquetes de horas de tutorías manuales).
 * Reglas de negocio en src/lib/services/session-package.service.js; matemática
 * en src/lib/payments/package-math.js.
 *
 * Models: SessionPackage, Payment (packageId)
 */

import prisma from '../prisma';

/** Sessions that no longer use hours of the package. */
const DROPPED_SESSION_STATUSES = ['Canceled', 'Rejected'];

const PACKAGE_SELECT = {
  id: true,
  committedMinutes: true,
  discountPercent: true,
  tutorSharePercent: true,
  status: true,
  notes: true,
  createdAt: true,
  closedAt: true,
  usedMinutes: true,
  settlementAmount: true,
  student: { select: { id: true, name: true, email: true, kind: true } },
  tutor: { select: { id: true, name: true } },
  course: { select: { id: true, code: true, name: true } },
  payments: {
    select: {
      id: true,
      amount: true,
      originalAmount: true,
      discountAmount: true,
      tutorPayoutBase: true,
      status: true,
      session: { select: { id: true, status: true, startTimestamp: true, endTimestamp: true } },
    },
    orderBy: { session: { startTimestamp: 'asc' } },
  },
};

export { DROPPED_SESSION_STATUSES };

export async function create(data) {
  return prisma.sessionPackage.create({ data, select: PACKAGE_SELECT });
}

export async function findById(id) {
  return prisma.sessionPackage.findUnique({ where: { id }, select: PACKAGE_SELECT });
}

/** Every package, active ones first, newest first. */
export async function findAll() {
  return prisma.sessionPackage.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: PACKAGE_SELECT,
  });
}

/**
 * Close only if still ACTIVE: answers whether this call made the move, so two
 * admins closing at once cannot both record a settlement.
 */
export async function closeIfActive(id, { closedById, usedMinutes, settlementAmount }) {
  const { count } = await prisma.sessionPackage.updateMany({
    where: { id, status: 'ACTIVE' },
    data: { status: 'CLOSED', closedAt: new Date(), closedById, usedMinutes, settlementAmount },
  });
  return count === 1;
}

/** Delete a package that never got a payment (a booking that failed right after creating it). */
export async function deleteIfUnused(id) {
  await prisma.sessionPackage.deleteMany({ where: { id, payments: { none: {} } } });
}
