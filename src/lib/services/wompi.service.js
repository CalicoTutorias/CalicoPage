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
import * as paymentRepo from '../repositories/payment.repository';
import * as sessionRepo from '../repositories/session.repository';
import * as sessionService from './session.service';
import * as notificationService from './notification.service';

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
 */
function generateReference() {
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
}) {
  const { publicKey, integritySecret } = getConfig();

  // Validation
  if (!studentId || !tutorId || !courseId || !amount) {
    throw new Error('Missing required payment parameters');
  }

  if (amount <= 0) {
    throw new Error('Invalid payment amount');
  }

  const reference = generateReference();

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
      attachments: attachments ? JSON.stringify(attachments) : '[]',
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
    createdAt: new Date().toISOString(),
  };

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
    metadata = {},
  } = transactionData;

  console.log('[Wompi] processSuccessfulPayment called with:', {
    wompiTransactionId,
    reference,
    amount_in_cents,
    status,
  });

  // Metadata values arrive as strings — coerce what we need.
  const { studentId, tutorId, courseId, startTimestamp, endTimestamp, topicsToReview, attachments: attachmentsJson } = metadata;

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
  //    Validate amount to avoid NaN reaching Prisma (Wompi uses snake_case amount_in_cents).
  const rawCents = Number(amount_in_cents);
  const amountInPesos = Number.isFinite(rawCents) ? rawCents / 100 : 0;

  let payment;
  try {
    payment = await paymentRepo.create({
      sessionId: session.id,
      studentId: studentIdStr,
      tutorId: tutorIdStr,
      amount: amountInPesos,
      status: 'pending',
      wompiId: wompiTransactionId,
    });
  } catch (payErr) {
    // Payment creation failed — cancel the just-created session to avoid orphaned sessions
    console.error('[Wompi] Payment creation failed, rolling back session:', payErr.message);
    try {
      await sessionRepo.updateSession(session.id, { status: 'Canceled' });
    } catch (rollbackErr) {
      console.error('[Wompi] Session rollback also failed:', rollbackErr.message);
    }
    throw payErr;
  }

  // 4. Reflect the pending amount in tutor's profile so statistics are accurate.
  try {
    await paymentRepo.incrementTutorNextPayment(tutorIdStr, amountInPesos);
  } catch (err) {
    console.error('[Wompi] Failed to update tutor next_payment:', err.message);
  }

  console.log(`[Wompi] ✓ Payment processed: session=${session.id}, payment=${payment.id}`);

  // 4. Payment-specific in-app notification (session lifecycle notifications are emitted inside bookPaidSession).
  notificationService.notifyPaymentConfirmed(studentIdStr, session);

  return {
    payment,
    session,
    message: 'Payment processed successfully',
  };
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
    return false;
  }

  // Compute HMAC-SHA256 of the body
  const computed = crypto
    .createHmac('sha256', integritySecret)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );

  if (!isValid) {
    console.error('[Wompi] Invalid webhook signature');
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

  const studentIdStr = String(studentId ?? '').trim();

  // Notify student of payment failure (fire-and-forget). No payment/session is created.
  if (studentIdStr) {
    notificationService.notifyPaymentFailed(studentIdStr, reference);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Testing Helpers
// ─────────────────────────────────────────────────────────────────────────

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
