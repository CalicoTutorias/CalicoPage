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
import * as sessionService from './session.service';
import prisma from '../prisma';

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
    },
  };

  const amountInCents = Math.round(amount * 100);

  // Integrity signature MUST be generated server-side — never in the browser
  const signatureString = `${reference}${amountInCents}COP${integritySecret}`;
  const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

  console.log(signature)
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
  console.log("ESTAMOS EN PAYMENTSINTENT")
  console.log(intentData)

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
    customer_email,
    metadata = {},
  } = transactionData;

  // Extract metadata
  const { studentId, tutorId, courseId, durationMinutes, startTimestamp, endTimestamp } = metadata;

  // Validation
  if (!studentId || !tutorId || !courseId || !startTimestamp || !endTimestamp) {
    throw new Error('Invalid metadata in payment transaction');
  }

  // 1. Deduplication: skip if this Wompi transaction was already processed
  const existingPayment = await paymentRepo.findByWompiId(wompiTransactionId);
  if (existingPayment) {
    console.warn(`[Wompi] Payment already processed for wompi_id=${wompiTransactionId}`);
    return {
      payment: existingPayment,
      session: null,
      message: 'Payment already processed',
    };
  }

  // 2. Create session via service — runs availability + conflict checks inside a
  //    serializable transaction, so concurrent payments for the same slot are rejected.
  const studentIdInt = parseInt(studentId, 10);
  const tutorIdInt = parseInt(tutorId, 10);

  const session = await sessionService.createSession(studentIdInt, {
    courseId,
    tutorId: tutorIdInt,
    sessionType: 'Individual',
    startTimestamp,
    endTimestamp,
    locationType: 'Virtual',
    notes: `Booked via payment intent ${reference}`,
  });

  // 3. Record the payment against the newly created session
  const amountInPesos = amount_in_cents / 100;
  const payment = await paymentRepo.create({
    sessionId: session.id,
    studentId: studentIdInt,
    tutorId: tutorIdInt,
    amount: amountInPesos,
    status: 'completed',
    wompiId: wompiTransactionId,
  });

  console.log(`[Wompi] ✓ Payment processed: session=${session.id}, payment=${payment.id}`);

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
 * Handle failed payment
 * Currently just logs; in future, might send email notifications
 */
export async function handleFailedPayment({
  wompiTransactionId,
  reference,
  reason,
  studentId,
  tutorId,
}) {
  console.error(`[Wompi] ✗ Payment failed: wompi_id=${wompiTransactionId}, reason=${reason}`);
  // TODO: Send email to student notifying of payment failure
  // TODO: Log failed attempt for analytics
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
