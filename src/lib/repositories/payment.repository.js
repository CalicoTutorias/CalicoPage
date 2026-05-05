/**
 * Payment Repository
 * Handles database operations for payments (PostgreSQL via Prisma).
 *
 * Model: Payment
 */

import prisma from '../prisma';

// ===== PAYMENT CRUD =====

/**
 * Create a new payment record
 */
export async function create({
  sessionId,
  studentId,
  tutorId,
  amount,
  status = 'pending',
  wompiId = null,
}) {
  return prisma.payment.create({
    data: {
      sessionId,
      studentId,
      tutorId,
      amount,
      status,
      wompiId,
    },
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
 * Increment tutor's next_payment when a Wompi payment is approved
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
