/**
 * Coupon Repository
 * Prisma wrappers for Coupon + CouponRedemption.
 *
 * Concurrency model for redemptions lives here: `reserveWithLock` serialises
 * "count uses → insert hold" per coupon with a row lock, so two students
 * cannot both take the last slot. Business rules (limits, validity) stay in
 * coupon.service.js and are injected as the `check` callback.
 *
 * Models: Coupon, CouponRedemption
 */

import prisma from '../prisma';
import { COUPON_HOLD_MINUTES } from '../payments/coupon-math';

const COUPON_SELECT = {
  id: true,
  code: true,
  description: true,
  discountType: true,
  discountValue: true,
  absorber: true,
  maxRedemptions: true,
  perUserLimit: true,
  firstSessionOnly: true,
  validFrom: true,
  validUntil: true,
  isActive: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  createdBy: { select: { id: true, name: true } },
};

const REDEMPTION_ADMIN_SELECT = {
  id: true,
  status: true,
  intentReference: true,
  originalAmount: true,
  discountAmount: true,
  finalAmount: true,
  tutorPayoutBase: true,
  absorber: true,
  reservedAt: true,
  approvedAt: true,
  releasedAt: true,
  user: { select: { id: true, name: true, email: true } },
  session: {
    select: {
      id: true,
      status: true,
      startTimestamp: true,
      course: { select: { id: true, code: true, name: true } },
      tutor: { select: { id: true, name: true } },
    },
  },
  payment: { select: { id: true, status: true, createdAt: true } },
};

const toNumber = (v) => (v == null ? 0 : Number(v));

// ===== COUPONS =====

/** Lookup by (already normalised, uppercase) code. Includes soft-deleted rows. */
export async function findByCode(code) {
  if (!code) return null;
  return prisma.coupon.findUnique({ where: { code }, select: COUPON_SELECT });
}

export async function findById(id) {
  if (!id) return null;
  return prisma.coupon.findUnique({ where: { id }, select: COUPON_SELECT });
}

export async function findAll({ includeDeleted = false } = {}) {
  return prisma.coupon.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }],
    select: COUPON_SELECT,
  });
}

export async function create(data) {
  return prisma.coupon.create({ data, select: COUPON_SELECT });
}

export async function update(id, data) {
  return prisma.coupon.update({ where: { id }, data, select: COUPON_SELECT });
}

export async function softDelete(id) {
  return prisma.coupon.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
    select: COUPON_SELECT,
  });
}

export async function hardDelete(id) {
  return prisma.coupon.delete({ where: { id }, select: COUPON_SELECT });
}

export async function countRedemptions(couponId) {
  return prisma.couponRedemption.count({ where: { couponId } });
}

// ===== USAGE COUNTERS =====

function mapUsage(row = {}) {
  return {
    approvedCount:     toNumber(row.approved_count),
    activeHolds:       toNumber(row.active_holds),
    userApprovedCount: toNumber(row.user_approved_count),
    userActiveHolds:   toNumber(row.user_active_holds),
  };
}

/**
 * Counters the validation rules need, in one round trip.
 * "Active holds" are RESERVED rows younger than COUPON_HOLD_MINUTES.
 * `excludeReference` leaves out the intent currently being approved, so its
 * own (stale) hold never counts against itself.
 */
export async function usageSnapshot({ couponId, userId, excludeReference = '' }, client = prisma) {
  const rows = await client.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE status = 'APPROVED')::int                               AS approved_count,
      COUNT(*) FILTER (WHERE status = 'RESERVED'
        AND reserved_at > NOW() - (${COUPON_HOLD_MINUTES}::int * INTERVAL '1 minute'))::int AS active_holds,
      COUNT(*) FILTER (WHERE status = 'APPROVED' AND user_id = ${userId})::int        AS user_approved_count,
      COUNT(*) FILTER (WHERE status = 'RESERVED' AND user_id = ${userId}
        AND reserved_at > NOW() - (${COUPON_HOLD_MINUTES}::int * INTERVAL '1 minute'))::int AS user_active_holds
    FROM coupon_redemptions
    WHERE coupon_id = ${couponId}
      AND intent_reference <> ${excludeReference};
  `;
  return mapUsage(rows[0]);
}

/** Row lock on the coupon — serialises reserve/approve decisions. */
export async function lockCoupon(couponId, client = prisma) {
  await client.$queryRaw`SELECT id FROM coupons WHERE id = ${couponId} FOR UPDATE`;
}

/**
 * Per-coupon totals for the admin list, keyed by coupon id.
 * `discount_calico` = Σ (tutor_payout_base − final_amount): the part of the
 * discount Calico absorbed by keeping the tutor whole.
 */
export async function usageStatsByCoupon() {
  const rows = await prisma.$queryRaw`
    SELECT
      coupon_id,
      COUNT(*) FILTER (WHERE status = 'APPROVED')::int                               AS approved_count,
      COUNT(*) FILTER (WHERE status = 'RESERVED'
        AND reserved_at > NOW() - (${COUPON_HOLD_MINUTES}::int * INTERVAL '1 minute'))::int AS active_holds,
      COUNT(DISTINCT user_id) FILTER (WHERE status = 'APPROVED')::int                AS unique_users,
      COALESCE(SUM(discount_amount)                    FILTER (WHERE status = 'APPROVED'), 0)::float8 AS discount_total,
      COALESCE(SUM(tutor_payout_base - final_amount)   FILTER (WHERE status = 'APPROVED'), 0)::float8 AS discount_calico,
      COALESCE(SUM(final_amount)                       FILTER (WHERE status = 'APPROVED'), 0)::float8 AS charged_total,
      COALESCE(SUM(original_amount)                    FILTER (WHERE status = 'APPROVED'), 0)::float8 AS list_total,
      COALESCE(SUM(tutor_payout_base)                  FILTER (WHERE status = 'APPROVED'), 0)::float8 AS tutor_base_total
    FROM coupon_redemptions
    GROUP BY coupon_id;
  `;
  const map = new Map();
  for (const r of rows) {
    map.set(r.coupon_id, {
      approvedCount:  toNumber(r.approved_count),
      activeHolds:    toNumber(r.active_holds),
      uniqueUsers:    toNumber(r.unique_users),
      discountTotal:  toNumber(r.discount_total),
      discountCalico: toNumber(r.discount_calico),
      chargedTotal:   toNumber(r.charged_total),
      listTotal:      toNumber(r.list_total),
      tutorBaseTotal: toNumber(r.tutor_base_total),
    });
  }
  return map;
}

/** Has this student ever paid (or been booked) for a session? Drives `firstSessionOnly`. */
export async function hasPriorPayments(userId) {
  const n = await prisma.payment.count({
    where: { studentId: userId, status: { in: ['paid', 'pending'] } },
  });
  return n > 0;
}

// ===== REDEMPTIONS =====

/**
 * Reserve one use of a coupon for a payment intent.
 *
 * Inside one transaction, with the coupon row locked:
 *   1. release any previous RESERVED hold of the same user on this coupon
 *      (they abandoned that checkout and are retrying),
 *   2. count approved uses + active holds,
 *   3. run the caller's `check(usage)` — it throws to abort,
 *   4. insert the RESERVED redemption.
 *
 * @param {{ couponId, userId, intentReference, snapshot: object, check: Function }} args
 */
export async function reserveWithLock({ couponId, userId, intentReference, snapshot, check }) {
  return prisma.$transaction(async (tx) => {
    await lockCoupon(couponId, tx);

    await tx.couponRedemption.updateMany({
      where: { couponId, userId, status: 'RESERVED' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    const usage = await usageSnapshot({ couponId, userId }, tx);
    if (typeof check === 'function') check(usage);

    return tx.couponRedemption.create({
      data: {
        couponId,
        userId,
        intentReference,
        status: 'RESERVED',
        originalAmount:  snapshot.originalAmount,
        discountAmount:  snapshot.discountAmount,
        finalAmount:     snapshot.finalAmount,
        tutorPayoutBase: snapshot.tutorPayoutBase,
        absorber:        snapshot.absorber,
      },
    });
  });
}

export async function findRedemptionByReference(intentReference) {
  if (!intentReference) return null;
  return prisma.couponRedemption.findUnique({
    where: { intentReference },
    include: { coupon: { select: { id: true, code: true, absorber: true } } },
  });
}

/** Release a hold whose payment failed. No-op unless still RESERVED. */
export async function releaseByReference(intentReference) {
  if (!intentReference) return { count: 0 };
  return prisma.couponRedemption.updateMany({
    where: { intentReference, status: 'RESERVED' },
    data: { status: 'RELEASED', releasedAt: new Date() },
  });
}

/**
 * Self-heal: record an APPROVED redemption when a paid intent carried a
 * coupon snapshot but no hold row exists (e.g. the hold insert failed after
 * the intent was signed). Idempotent on `intentReference`.
 */
export async function createApproved({
  couponId, userId, intentReference, paymentId, sessionId, snapshot,
}) {
  return prisma.couponRedemption.upsert({
    where: { intentReference },
    update: { status: 'APPROVED', approvedAt: new Date(), paymentId, sessionId },
    create: {
      couponId,
      userId,
      intentReference,
      status: 'APPROVED',
      approvedAt: new Date(),
      paymentId,
      sessionId,
      originalAmount:  snapshot.originalAmount,
      discountAmount:  snapshot.discountAmount,
      finalAmount:     snapshot.finalAmount,
      tutorPayoutBase: snapshot.tutorPayoutBase,
      absorber:        snapshot.absorber,
    },
  });
}

export async function findRedemptionsForAdmin(couponId, { limit = 500 } = {}) {
  return prisma.couponRedemption.findMany({
    where: { couponId },
    orderBy: { reservedAt: 'desc' },
    take: Math.min(limit, 1000),
    select: REDEMPTION_ADMIN_SELECT,
  });
}
