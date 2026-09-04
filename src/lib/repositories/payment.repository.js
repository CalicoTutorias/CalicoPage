/**
 * Payment Repository
 * Handles database operations for payments (PostgreSQL via Prisma).
 *
 * Model: Payment
 */

import prisma from '../prisma';
import * as couponRepo from './coupon.repository';

// ===== PAYMENT CRUD =====

/**
 * Build the row for a payment. The money breakdown (see the Payment model)
 * defaults to the no-coupon case: originalAmount = tutorPayoutBase = amount,
 * discountAmount = 0. Callers that applied a coupon pass all four fields.
 */
function buildPaymentData({
  sessionId,
  studentId,
  tutorId,
  amount,
  originalAmount,
  discountAmount,
  tutorPayoutBase,
  couponId = null,
  status = 'pending',
  wompiId = null,
}) {
  return {
    sessionId,
    studentId,
    tutorId,
    amount,
    originalAmount:  originalAmount  ?? amount,
    discountAmount:  discountAmount  ?? 0,
    tutorPayoutBase: tutorPayoutBase ?? amount,
    couponId,
    status,
    wompiId,
  };
}

/**
 * Create a new payment record
 */
export async function create(params) {
  return prisma.payment.create({ data: buildPaymentData(params) });
}

/**
 * Create a payment AND approve the coupon redemption of its intent, atomically.
 *
 * With `check` (the hold was not a fresh RESERVED one: expired, RELEASED by a
 * later intent of the same user, or missing), the coupon row is locked and
 * `check(usage)` re-validates the limits with the current counters — it
 * throws to abort the whole transaction, so a student who pre-minted several
 * discounted intents cannot pay them all. Without `check`, the slot was
 * already counted when the hold was reserved.
 *
 * The redemption row moves to APPROVED linked to payment + session; if no row
 * exists for the reference it is created directly as APPROVED from `snapshot`
 * so the use is still traceable.
 *
 * @returns {Promise<{ payment: object, outcome: 'approved' | 'created' | 'already-approved' }>}
 */
export async function createWithCouponRedemption(
  params,
  { intentReference, couponId, userId, snapshot = null, check = null },
) {
  return prisma.$transaction(async (tx) => {
    if (typeof check === 'function') {
      await couponRepo.lockCoupon(couponId, tx);
      const usage = await couponRepo.usageSnapshot(
        { couponId, userId, excludeReference: intentReference },
        tx,
      );
      check(usage); // throws → nothing below is committed
    }

    const payment = await tx.payment.create({ data: buildPaymentData(params) });

    const approved = await tx.couponRedemption.updateMany({
      where: { intentReference, status: { not: 'APPROVED' } },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        paymentId: payment.id,
        sessionId: payment.sessionId,
      },
    });
    if (approved.count > 0) return { payment, outcome: 'approved' };

    const existing = await tx.couponRedemption.findUnique({ where: { intentReference } });
    if (existing) return { payment, outcome: 'already-approved' };

    if (snapshot) {
      await tx.couponRedemption.create({
        data: {
          couponId,
          userId,
          intentReference,
          status: 'APPROVED',
          approvedAt: new Date(),
          paymentId: payment.id,
          sessionId: payment.sessionId,
          originalAmount: snapshot.originalAmount,
          discountAmount: snapshot.discountAmount,
          finalAmount: snapshot.finalAmount,
          tutorPayoutBase: snapshot.tutorPayoutBase,
          absorber: snapshot.absorber,
        },
      });
    }
    return { payment, outcome: 'created' };
  });
}

/**
 * Find payment by ID
 */
export async function findById(id) {
  return prisma.payment.findUnique({
    where: { id },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Find payment by Wompi ID (for deduplication)
 */
export async function findByWompiId(wompiId) {
  return prisma.payment.findFirst({
    where: { wompiId },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Find payment by session ID
 */
export async function findBySessionId(sessionId) {
  return prisma.payment.findFirst({
    where: { sessionId },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Find all payments for a student
 */
export async function findByStudentId(studentId, limit = 50) {
  return prisma.payment.findMany({
    where: { studentId },
    include: {
      session: true,
      tutor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Find all payments for a tutor
 */
export async function findByTutorId(tutorId, limit = 50) {
  return prisma.payment.findMany({
    where: { tutorId },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Find payments by status
 */
export async function findByStatus(status, limit = 50) {
  return prisma.payment.findMany({
    where: { status },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Update payment status and wompi_id
 */
export async function updateStatus(id, status, wompiId = null) {
  return prisma.payment.update({
    where: { id },
    data: {
      status,
      ...(wompiId && { wompiId }),
      updatedAt: new Date(),
    },
    include: {
      session: true,
      student: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Check if payment already exists for a given Wompi transaction
 * @returns {boolean} True if payment already exists
 */
export async function existsByWompiId(wompiId) {
  if (!wompiId) return false;
  const count = await prisma.payment.count({
    where: { wompiId },
  });
  return count > 0;
}

/**
 * Check if payment already exists for a session
 * @returns {boolean} True if payment already exists
 */
export async function existsBySessionId(sessionId) {
  if (!sessionId) return false;
  const count = await prisma.payment.count({
    where: { sessionId },
  });
  return count > 0;
}

/**
 * Increment tutor's next_payment when a payment is approved.
 * Pass the payment's `tutorPayoutBase` (NOT `amount`): with a Calico-absorbed
 * coupon the tutor is still owed their share of the full list price.
 */
export async function incrementTutorNextPayment(tutorId, amount) {
  return prisma.tutorProfile.update({
    where: { userId: String(tutorId) },
    data: { nextPayment: { increment: amount } },
  });
}

/**
 * Move amount from next_payment to total_earning when tutor is manually paid
 */
export async function moveTutorPaymentToEarning(tutorId, amount) {
  return prisma.tutorProfile.update({
    where: { userId: String(tutorId) },
    data: {
      nextPayment: { decrement: amount },
      totalEarning: { increment: amount },
    },
  });
}
