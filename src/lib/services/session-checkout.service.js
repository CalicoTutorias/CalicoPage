/**
 * Session checkout — the one place a paid (or free) tutoring booking is
 * written: session + payment row (+ coupon redemption) + tutor balance +
 * intent consumption + notifications.
 *
 * Two entry points share it:
 *   - `wompi.service.processSuccessfulPayment` after Wompi approves a charge;
 *   - `bookFreeSession` for a 100 % courtesy coupon, which never reaches
 *     Wompi (it cannot charge 0): the booking is written straight from
 *     create-intent with amount 0, and the tutor is still owed their share
 *     of the list price (Calico absorbs — `coupon-math.js`).
 */

import * as Sentry from '@sentry/nextjs';
import * as paymentRepo from '../repositories/payment.repository';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as sessionService from './session.service';
import * as notificationService from './notification.service';
import * as couponService from './coupon.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import { buildCouponSnapshot, readCouponSnapshot, COUPON_ABSORBERS } from '../payments/coupon-math';

/**
 * Map a coupon rule rejection at payment time to the error the webhook and
 * confirm-payment treat as "paid but must not be honoured → manual review".
 */
export function couponLimitError(err, { reference, wompiTransactionId, couponId }) {
  if (!couponService.isCouponError(err)) return err;
  const mapped = new Error(
    `Coupon limits exceeded at payment time for ${reference} (${err.code}) — refusing to honour the discount`,
  );
  mapped.code = 'COUPON_LIMIT_EXCEEDED';
  mapped.reason = err.code;
  mapped.wompiTransactionId = wompiTransactionId;
  mapped.couponId = couponId;
  return mapped;
}

/**
 * Create the payment and approve its coupon redemption atomically.
 *
 * `approval` comes from coupon.service.prepareRedemptionApproval: a fresh
 * RESERVED hold moves to APPROVED as-is; an expired/released/missing hold is
 * re-validated under the coupon lock (`approval.check`) and refused when the
 * limits would be exceeded — the money was charged, so the webhook flags it
 * for manual refund rather than honouring an over-limit discount. Both
 * non-fresh outcomes are reported to Sentry so they stay visible.
 */
async function recordPaymentWithCoupon({ paymentInput, couponSnapshot, reference, wompiTransactionId, approval }) {
  let result;
  try {
    result = await paymentRepo.createWithCouponRedemption(paymentInput, {
      intentReference: reference,
      couponId: couponSnapshot.couponId,
      userId: paymentInput.studentId,
      snapshot: {
        originalAmount: couponSnapshot.originalAmount,
        discountAmount: couponSnapshot.discountAmount,
        finalAmount: paymentInput.amount,
        tutorPayoutBase: couponSnapshot.tutorPayoutBase,
        absorber: couponSnapshot.absorber,
      },
      check: approval?.check ?? null,
    });
  } catch (err) {
    throw couponLimitError(err, { reference, wompiTransactionId, couponId: couponSnapshot.couponId });
  }

  if (approval && !approval.fresh) {
    const previousStatus = approval.existing?.status ?? 'MISSING';
    console.warn(`[Wompi] Coupon hold for ${reference} was ${previousStatus}; limits re-checked and discount honoured`);
    Sentry.captureMessage(
      result.outcome === 'created'
        ? '[Wompi] Coupon redemption row was missing; recorded as APPROVED'
        : '[Wompi] Coupon redemption approved past its hold window',
      {
        level: 'warning',
        tags: { domain: 'payments', service: 'wompi', operation: 'coupon-approve' },
        extra: { reference, wompiTransactionId, couponId: couponSnapshot.couponId, previousStatus, outcome: result.outcome },
      },
    );
  }

  return result.payment;
}

/**
 * Write a booking whose payment is settled: book the session, record the
 * payment (approving the coupon redemption when there is one), credit the
 * tutor's pending balance, consume the intent and notify the student.
 *
 * Business errors from the booking (SESSION_CONFLICT, OUTSIDE_AVAILABILITY,
 * MAX_SESSIONS_REACHED…) and coupon refusals (COUPON_LIMIT_EXCEEDED) bubble
 * up with their `code` — the caller decides whether that means "refund".
 * A payment write failure cancels the session just created (no orphans).
 *
 * @returns {Promise<{ payment: object, session: object }>}
 */
export async function recordPaidSessionBooking({
  reference,
  wompiTransactionId = null,
  studentId,
  tutorId,
  courseId,
  startTimestamp,
  endTimestamp,
  topicsToReview,
  attachments = [],
  amountInPesos,
  breakdown,
  couponSnapshot = null,
  approval = null,
}) {
  const studentIdStr = String(studentId ?? '').trim();
  const tutorIdStr = String(tutorId ?? '').trim();
  const serviceTag = wompiTransactionId ? 'wompi' : 'free-checkout';

  // 1. Delegate session creation to the domain service.
  //    Business-logic errors (SESSION_CONFLICT, OUTSIDE_AVAILABILITY, ...) bubble up
  //    to the caller (webhook / confirm-payment / create-intent), which decides.
  let session;
  try {
    session = await sessionService.bookPaidSession({
      studentId: studentIdStr,
      tutorId: tutorIdStr,
      courseId,
      sessionType: 'Individual',
      startTimestamp: new Date(startTimestamp),
      endTimestamp: new Date(endTimestamp),
      locationType: 'Virtual',
      notes: `Booked via payment intent ${reference}`,
      topicsToReview: topicsToReview || null,
      attachments: Array.isArray(attachments) ? attachments : [],
    });
  } catch (err) {
    err.wompiTransactionId = wompiTransactionId;
    throw err;
  }

  // 2. Record the payment linked to the newly-created session. It is `paid`
  //    from birth — the charge was verified against Wompi (or there was
  //    nothing to charge) — which is what every revenue metric and the
  //    payouts queue filter on.
  const paymentInput = {
    sessionId: session.id,
    studentId: studentIdStr,
    tutorId: tutorIdStr,
    amount: amountInPesos,
    ...breakdown,
    status: 'paid',
    wompiId: wompiTransactionId,
  };

  let payment;
  try {
    payment = couponSnapshot
      ? await recordPaymentWithCoupon({ paymentInput, couponSnapshot, reference, wompiTransactionId, approval })
      : await paymentRepo.create(paymentInput);
  } catch (payErr) {
    // Payment creation failed — cancel the just-created session to avoid orphaned sessions
    console.error('[Wompi] Payment creation failed, rolling back session:', payErr.message);
    Sentry.captureException(payErr, {
      level: 'error',
      tags: { domain: 'payments', service: serviceTag, operation: 'create-payment' },
      extra: { sessionId: session.id, wompiTransactionId, amountInPesos },
    });

    try {
      await sessionRepo.updateSession(session.id, { status: 'Canceled' });
    } catch (rollbackErr) {
      console.error('[Wompi] Session rollback also failed:', rollbackErr.message);
      Sentry.captureException(rollbackErr, {
        level: 'fatal',
        tags: { domain: 'payments', service: serviceTag, operation: 'rollback-session' },
        extra: { sessionId: session.id, wompiTransactionId, originalError: payErr.message },
      });
    }
    throw payErr;
  }

  // 3. Reflect the pending amount in tutor's profile so statistics are accurate.
  //    Uses the tutor payout BASE, not the charged amount: with a coupon
  //    Calico absorbs, the tutor is still owed their share of the list price.
  try {
    await paymentRepo.incrementTutorNextPayment(tutorIdStr, breakdown.tutorPayoutBase);
  } catch (err) {
    console.error('[Wompi] Failed to update tutor next_payment:', err.message);
    Sentry.captureException(err, {
      level: 'warning',
      tags: { domain: 'payments', service: serviceTag, operation: 'increment-tutor-next-payment' },
      extra: { tutorId: tutorIdStr, amountInPesos, tutorPayoutBase: breakdown.tutorPayoutBase },
    });
  }

  // Mark the durable intent as consumed (best-effort, never throws).
  await paymentIntentRepo.markConsumed(reference);

  // A new paid row changes every revenue KPI — drop the 5-min metrics cache.
  try {
    invalidateAllMetrics();
  } catch (err) {
    console.warn('[Wompi] Failed to invalidate metrics cache:', err.message);
  }

  // 4. Payment-specific in-app notification (session lifecycle notifications are emitted inside bookPaidSession).
  notificationService.notifyPaymentConfirmed(studentIdStr, session);

  return { payment, session };
}

/**
 * Book a session covered 100 % by a courtesy coupon — no Wompi involved.
 *
 * Called by create-intent right after the coupon hold is reserved, with the
 * server-computed breakdown (`discount`: the same object a Wompi intent
 * would freeze). The intent row is still persisted so the redemption, the
 * admin coupon detail and the audit trail all key on the same reference.
 *
 * @returns {Promise<{ payment: object, session: object, reference: string }>}
 */
export async function bookFreeSession({
  reference,
  studentId,
  tutorId,
  courseId,
  durationMinutes,
  startTimestamp,
  endTimestamp,
  topicsToReview,
  attachments = [],
  discount,
}) {
  const original = Number(discount?.originalAmount);
  const off = Number(discount?.discountAmount);
  if (!reference || !discount?.couponId || !(original > 0) || off !== original) {
    const err = new Error('bookFreeSession requires a 100 % coupon breakdown');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const snapshot = buildCouponSnapshot({
    coupon: { id: discount.couponId, code: discount.couponCode },
    pricing: {
      absorber: COUPON_ABSORBERS.CALICO,
      originalAmount: original,
      discountAmount: off,
      tutorPayoutBase: Number(discount.tutorPayoutBase ?? original),
    },
    redemptionId: discount.redemptionId,
  });

  const metadata = {
    studentId: String(studentId),
    tutorId: String(tutorId),
    courseId,
    durationMinutes,
    startTimestamp: new Date(startTimestamp).toISOString(),
    endTimestamp: new Date(endTimestamp).toISOString(),
    topicsToReview: topicsToReview || '',
    attachments: JSON.stringify(Array.isArray(attachments) ? attachments : []),
    ...snapshot,
    free: 'true',
  };
  await paymentIntentRepo.create({ reference, metadata, kind: 'session' });

  const couponSnapshot = readCouponSnapshot(metadata);
  const breakdown = {
    originalAmount: couponSnapshot.originalAmount,
    discountAmount: couponSnapshot.discountAmount,
    tutorPayoutBase: couponSnapshot.tutorPayoutBase,
    couponId: couponSnapshot.couponId,
  };

  const { payment, session } = await recordPaidSessionBooking({
    reference,
    wompiTransactionId: null,
    studentId,
    tutorId,
    courseId,
    startTimestamp,
    endTimestamp,
    topicsToReview,
    attachments,
    amountInPesos: 0,
    breakdown,
    couponSnapshot,
    approval: null,
  });

  console.log(`[free-checkout] ✓ Courtesy booking: session=${session.id}, payment=${payment.id}, reference=${reference}`);
  return { payment, session, reference };
}
