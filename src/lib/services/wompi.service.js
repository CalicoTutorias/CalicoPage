/**
 * Wompi Service - Payment Integration
 * Handles integration with Wompi payment gateway.
 *
 * Environment variables required:
 *   WOMPI_PUBLIC_KEY  – Public key for frontend (publishable key)
 *   WOMPI_PRIVATE_KEY – Public key for transactions (same as above, but used server-side)
 *   WOMPI_INTEGRITY_SECRET         – Secret for webhook signature verification
 */

import crypto from 'crypto';
import * as Sentry from '@sentry/nextjs';
import * as paymentRepo from '../repositories/payment.repository';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as sessionService from './session.service';
import * as notificationService from './notification.service';
import * as couponRepo from '../repositories/coupon.repository';
import * as couponService from './coupon.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import { buildCouponSnapshot, readCouponSnapshot } from '../payments/coupon-math';

const WOMPI_API_BASE = 'https://api.wompi.co/v1';

// ─────────────────────────────────────────────────────────────────────────
// Configuration & Validation
// ─────────────────────────────────────────────────────────────────────────

function getConfig() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;

  if (!publicKey) {
    throw new Error('WOMPI public key environment variables not configured');
  }
  if (!privateKey) {
    throw new Error('WOMPI private key environment variables not configured');
  }
  if (!integritySecret) {
    throw new Error('WOMPI_INTEGRITY_SECRET environment variable is not configured');
  }

  return { publicKey, integritySecret };
}

/**
 * Generate a unique reference for the transaction
 * Format: session_id-timestamp or similar
 *
 * Exported so create-intent can mint the reference BEFORE reserving a coupon
 * hold (the hold is keyed by it) and then hand it to createPaymentIntent.
 */
export function generateReference() {
  return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an instance ID for Wompi (usually your merchant ID)
 * In Wompi, the "instance" is your account/merchant ID
 */
function getInstance() {
  // For now, using a fixed instance ID. In production, this might come from env vars
  // or be derived from the tutor's merchant account
  return process.env.WOMPI_INSTANCE_ID || 'default';
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Intent Creation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a payment intent in Wompi
 * This prepares a transaction in Wompi's system before redirecting to checkout
 *
 * @param {Object} params
 * @param {number} params.studentId - Student making the payment
 * @param {number} params.tutorId - Tutor receiving payment
 * @param {string} params.courseId - Course being booked
 * @param {number} params.amount - Amount in COP (Colombian Pesos)
 * @param {number} params.durationMinutes - Duration of the session in minutes
 * @param {Date} params.startTimestamp - When the session starts
 * @param {Date} params.endTimestamp - When the session ends
 * @param {string} params.redirectUrl - URL to redirect after payment
 * @param {string} [params.reference] - Pre-minted reference (coupon flow); generated otherwise
 * @param {Object|null} [params.discount] - Server-computed coupon breakdown, or null:
 *   { couponId, couponCode, absorber, redemptionId, originalAmount, discountAmount, tutorPayoutBase }.
 *   `amount` must already be the discounted total — it is what gets signed.
 * @returns {Object} Payment intent data including checkout URL
 */
export async function createPaymentIntent({
  studentId,
  tutorId,
  courseId,
  amount,
  durationMinutes,
  startTimestamp,
  endTimestamp,
  redirectUrl,
  topicsToReview,
  attachments,
  reference: presetReference,
  discount = null,
}) {
  const { publicKey, integritySecret } = getConfig();

  // Validation
  if (!studentId || !tutorId || !courseId || !amount) {
    throw new Error('Missing required payment parameters');
  }

  if (amount <= 0) {
    throw new Error('Invalid payment amount');
  }

  const reference = presetReference || generateReference();

  // Money breakdown frozen into the intent. Without a coupon the list price
  // IS the charge; with one, the snapshot is what the webhook/confirm path
  // reconciles the paid amount against (never the client).
  const pricingSnapshot = discount
    ? buildCouponSnapshot({
        coupon: { id: discount.couponId, code: discount.couponCode },
        pricing: {
          absorber: discount.absorber,
          originalAmount: discount.originalAmount,
          discountAmount: discount.discountAmount,
          tutorPayoutBase: discount.tutorPayoutBase,
        },
        redemptionId: discount.redemptionId,
      })
    : {
        originalAmount: String(Math.round(amount)),
        discountAmount: '0',
        tutorPayoutBase: String(Math.round(amount)),
      };

  // Build the payment payload
  const paymentPayload = {
    amount_in_cents: Math.round(amount * 100), // Wompi works in cents
    currency: 'COP',
    customer: {
      email: `student_${studentId}@calico.local`, // Placeholder; should be fetched from DB
    },
    reference,
    redirect_url: redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/payments/confirm`,
    // Additional metadata to track the session
    metadata: {
      studentId: String(studentId),
      tutorId: String(tutorId),
      courseId,
      durationMinutes,
      startTimestamp: startTimestamp.toISOString(),
      endTimestamp: endTimestamp.toISOString(),
      topicsToReview: topicsToReview || '',
      attachments: JSON.stringify(Array.isArray(attachments) ? attachments : []),
      ...pricingSnapshot,
    },
  };

  const amountInCents = Math.round(amount * 100);

  // Integrity signature MUST be generated server-side — never in the browser
  const signatureString = `${reference}${amountInCents}COP${integritySecret}`;
  const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

  const intentData = {
    id: `intent_${reference}`,
    public_key: publicKey,
    reference,
    amount,
    amountInCents,
    currency: 'COP',
    signature,
    checkoutUrl: `${WOMPI_API_BASE}/checkout?reference=${reference}&public_key=${publicKey}`,
    metadata: paymentPayload.metadata,
    // What the checkout shows: list price, discount and the signed total.
    pricing: {
      originalAmount: Number(pricingSnapshot.originalAmount),
      discountAmount: Number(pricingSnapshot.discountAmount),
      amount,
      couponCode: discount?.couponCode ?? null,
    },
    createdAt: new Date().toISOString(),
  };

  // Durably persist the order ticket keyed by `reference` so the webhook can
  // rebuild the session if the client never calls confirm-payment. This is a
  // best-effort safety net: a failure here must NOT block the payment — the
  // client still carries the same metadata through the happy path.
  try {
    await paymentIntentRepo.create({
      reference,
      metadata: paymentPayload.metadata,
    });
  } catch (err) {
    console.warn(`[Wompi] Failed to persist payment intent ${reference}:`, err.message);
  }

  Sentry.addBreadcrumb({
    category: 'payments',
    message: `Payment intent created: ${reference}`,
    level: 'info',
    data: {
      reference,
      amountInCents,
      courseId,
      tutorId,
    },
  });

  return intentData;
}

// ─────────────────────────────────────────────────────────────────────────
// Payment Confirmation & Session/Review Creation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Process successful payment and create session + payment + review
 * This is called from the webhook after Wompi confirms payment
 *
 * @param {Object} transactionData - Data from Wompi webhook
 * @returns {Object} Created payment, session, review
 */
export async function processSuccessfulPayment(transactionData) {
  const {
    id: wompiTransactionId,
    reference,
    amount_in_cents,
    status,
  } = transactionData;

  console.log('[Wompi] processSuccessfulPayment called with:', {
    wompiTransactionId,
    reference,
    amount_in_cents,
    status,
  });

  // Validate required transaction fields
  if (!amount_in_cents) {
    console.error('[Wompi] Missing amount_in_cents in transaction data');
    throw new Error('Transaction amount is missing');
  }

  // Resolve the booking metadata. The client-driven confirm-payment path
  // carries it on the transaction; the server-to-server webhook does not, so
  // fall back to the durable PaymentIntent persisted at intent time (keyed by
  // `reference`). Either way the session is still created only here, after
  // the payment is approved.
  let metadata = transactionData.metadata || {};
  const hasCoreMetadata = (m) => m && m.studentId && m.tutorId && m.courseId && m.startTimestamp && m.endTimestamp;
  const stored = await paymentIntentRepo.findByReference(reference);
  if (!hasCoreMetadata(metadata)) {
    if (stored?.metadata && hasCoreMetadata(stored.metadata)) {
      console.log(`[Wompi] Recovered metadata from persisted intent for reference=${reference}`);
      metadata = stored.metadata;
    }
  }

  // Coupon snapshot: the persisted intent is the server-side source of truth
  // (transaction metadata is only a fallback — Wompi rarely echoes it).
  const couponSnapshot = readCouponSnapshot(stored?.metadata) ?? readCouponSnapshot(metadata);

  // Metadata values arrive as strings — coerce what we need.
  const { studentId, tutorId, courseId, durationMinutes, startTimestamp, endTimestamp, topicsToReview, attachments: attachmentsJson } = metadata;

  let attachmentsMeta = [];
  try {
    attachmentsMeta = attachmentsJson ? JSON.parse(attachmentsJson) : [];
  } catch {
    console.warn('[Wompi] Failed to parse attachments metadata, continuing without attachments');
  }

  const studentIdStr = String(studentId ?? '').trim();
  const tutorIdStr = String(tutorId ?? '').trim();

  if (!studentIdStr || !tutorIdStr || !courseId || !startTimestamp || !endTimestamp) {
    throw new Error('Invalid metadata in payment transaction');
  }

  // 1. Deduplication — Wompi may retry the webhook; we keep one payment per transaction.
  const existingPayment = await paymentRepo.findByWompiId(wompiTransactionId);
  if (existingPayment) {
    console.warn(`[Wompi] Payment already processed for wompi_id=${wompiTransactionId}`);
    return {
      payment: existingPayment,
      session: null,
      message: 'Payment already processed',
    };
  }

  // 1b. One intent = one payment. A different Wompi transaction for an intent
  //     that already produced a payment is refused (fail closed, flagged for
  //     manual review) instead of booking a second session on the same terms.
  if (stored?.consumedAt) {
    const err = new Error(`Payment intent ${reference} was already consumed`);
    err.code = 'INTENT_CONSUMED';
    err.wompiTransactionId = wompiTransactionId;
    throw err;
  }

  // Amount in pesos (Wompi uses snake_case amount_in_cents). Validated here so
  // NaN never reaches Prisma and so a coupon mismatch is caught BEFORE a
  // session is booked.
  const rawCents = Number(amount_in_cents);
  const amountInPesos = Number.isFinite(rawCents) ? rawCents / 100 : 0;

  // Money breakdown for the payment row. With a coupon, what Wompi charged
  // must equal the snapshot's list price minus its discount — the routes
  // already reconciled against the course price; this is defence in depth.
  let breakdown;
  if (couponSnapshot) {
    const expected = couponSnapshot.originalAmount - couponSnapshot.discountAmount;
    if (Math.abs(amountInPesos - expected) > 1) {
      const err = new Error(
        `Coupon snapshot mismatch for ${reference}: paid=${amountInPesos} expected=${expected}`,
      );
      err.code = 'AMOUNT_MISMATCH';
      err.wompiTransactionId = wompiTransactionId;
      throw err;
    }
    breakdown = {
      originalAmount: couponSnapshot.originalAmount,
      discountAmount: couponSnapshot.discountAmount,
      tutorPayoutBase: couponSnapshot.tutorPayoutBase,
      couponId: couponSnapshot.couponId,
    };
  } else {
    breakdown = {
      originalAmount: amountInPesos,
      discountAmount: 0,
      tutorPayoutBase: amountInPesos,
      couponId: null,
    };
  }

  // 1c. Coupon limits are re-validated at payment time. A fresh RESERVED hold
  //     already counted its slot; an expired/released/missing hold must not
  //     push the coupon past maxRedemptions / perUserLimit (a student could
  //     otherwise pre-mint several discounted intents and pay them all). The
  //     preliminary check runs here so we refuse BEFORE booking a session; the
  //     authoritative one re-runs under the coupon lock when the payment row
  //     is written.
  let approval = null;
  if (couponSnapshot) {
    try {
      approval = await couponService.prepareRedemptionApproval({
        couponId: couponSnapshot.couponId,
        intentReference: reference,
        userId: studentIdStr,
      });
    } catch (err) {
      throw couponLimitError(err, { reference, wompiTransactionId, couponId: couponSnapshot.couponId });
    }
  }

  // 2. Delegate session creation to the domain service.
  //    Business-logic errors (SESSION_CONFLICT, OUTSIDE_AVAILABILITY, ...) bubble up
  //    to the webhook handler, which logs them for manual refund review.
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
      attachments: attachmentsMeta,
    });
  } catch (err) {
    err.wompiTransactionId = wompiTransactionId;
    throw err;
  }

  // 3. Record the payment linked to the newly-created session.
  //    The transaction was verified APPROVED against Wompi's API (private
  //    key) before we got here, so the payment is `paid` from birth — that
  //    is what every revenue metric and the payouts queue filter on.
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
      tags: { domain: 'payments', service: 'wompi', operation: 'create-payment' },
      extra: { sessionId: session.id, wompiTransactionId, amountInPesos },
    });

    try {
      await sessionRepo.updateSession(session.id, { status: 'Canceled' });
    } catch (rollbackErr) {
      console.error('[Wompi] Session rollback also failed:', rollbackErr.message);
      Sentry.captureException(rollbackErr, {
        level: 'fatal',
        tags: { domain: 'payments', service: 'wompi', operation: 'rollback-session' },
        extra: { sessionId: session.id, wompiTransactionId, originalError: payErr.message },
      });
    }
    throw payErr;
  }

  // 4. Reflect the pending amount in tutor's profile so statistics are accurate.
  //    Uses the tutor payout BASE, not the charged amount: with a coupon
  //    Calico absorbs, the tutor is still owed their share of the list price.
  try {
    await paymentRepo.incrementTutorNextPayment(tutorIdStr, breakdown.tutorPayoutBase);
  } catch (err) {
    console.error('[Wompi] Failed to update tutor next_payment:', err.message);
    Sentry.captureException(err, {
      level: 'warning',
      tags: { domain: 'payments', service: 'wompi', operation: 'increment-tutor-next-payment' },
      extra: { tutorId: tutorIdStr, amountInPesos, tutorPayoutBase: breakdown.tutorPayoutBase },
    });
  }

  console.log(`[Wompi] ✓ Payment processed: session=${session.id}, payment=${payment.id}`);

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

  return {
    payment,
    session,
    message: 'Payment processed successfully',
  };
}

/**
 * Map a coupon rule rejection at payment time to the error the webhook and
 * confirm-payment treat as "paid but must not be honoured → manual review".
 */
function couponLimitError(err, { reference, wompiTransactionId, couponId }) {
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

// ─────────────────────────────────────────────────────────────────────────
// Webhook Signature Verification
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verify Wompi webhook signature
 * Wompi includes an 'X-Wompi-Signature' header with HMAC-SHA256 of the request body
 *
 * @param {string} body - Raw request body
 * @param {string} signature - Signature from X-Wompi-Signature header
 * @returns {boolean} True if signature is valid
 */
export function verifyWebhookSignature(body, signature) {
  const { integritySecret } = getConfig();

  if (!signature) {
    console.error('[Wompi] Missing X-Wompi-Signature header');
    Sentry.addBreadcrumb({
      category: 'payments',
      message: 'Missing X-Wompi-Signature header on webhook',
      level: 'warning',
    });
    return false;
  }

  // Compute HMAC-SHA256 of the body
  const computed = crypto
    .createHmac('sha256', integritySecret)
    .update(body)
    .digest('hex');

  // timingSafeEqual throws if the two buffers differ in length, so guard first.
  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  if (computedBuf.length !== signatureBuf.length) {
    console.error('[Wompi] Invalid webhook signature (length mismatch)');
    Sentry.addBreadcrumb({
      category: 'payments',
      message: 'Invalid webhook signature length mismatch',
      level: 'warning',
    });
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(computedBuf, signatureBuf);

  if (!isValid) {
    console.error('[Wompi] Invalid webhook signature');
    Sentry.addBreadcrumb({
      category: 'payments',
      message: 'Invalid webhook HMAC signature',
      level: 'warning',
    });
  }

  return isValid;
}

// ─────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────

/**
 * Handle failed/declined Wompi payment.
 * Records a payment row with status='failed' so the transaction history is complete.
 */
export async function handleFailedPayment({
  wompiTransactionId,
  reference,
  reason,
  studentId,
}) {
  console.error(`[Wompi] ✗ Payment failed: wompi_id=${wompiTransactionId}, reason=${reason}`);

  Sentry.addBreadcrumb({
    category: 'payments',
    message: `Payment failed/declined: ${reason}`,
    level: 'warning',
    data: { wompiTransactionId, reference, reason, studentId },
  });

  const studentIdStr = String(studentId ?? '').trim();

  // Free the coupon slot this intent was holding (no-op without a coupon).
  try {
    await couponRepo.releaseByReference(reference);
  } catch (err) {
    console.warn(`[Wompi] Failed to release coupon hold for ${reference}:`, err.message);
  }

  // Notify student of payment failure (fire-and-forget). No payment/session is created.
  if (studentIdStr) {
    notificationService.notifyPaymentFailed(studentIdStr, reference);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Testing Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Verify Wompi is reachable and the configured public key is valid.
 * Calls GET /merchants/:publicKey which requires no auth and returns 200 when the key resolves.
 * Throws a descriptive error on failure.
 */
export async function healthCheck() {
  const { publicKey } = getConfig(); // validates env vars first (throws if missing)

  const url = `${WOMPI_API_BASE}/merchants/${encodeURIComponent(publicKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Wompi merchant lookup failed (HTTP ${res.status})`);
    }
    return { ok: true, merchantId: publicKey };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Wompi API timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Simulate a Wompi payment for testing
 * In production, this would not be exposed
 */
export async function simulateWompiPayment(intentId, metadata) {
  const mockTransactionData = {
    id: `txn_${Date.now()}`,
    reference: intentId,
    amount_in_cents: Math.round(metadata.amount * 100),
    status: 'APPROVED',
    customer_email: `student_${metadata.studentId}@calico.local`,
    metadata,
  };

  return processSuccessfulPayment(mockTransactionData);
}
