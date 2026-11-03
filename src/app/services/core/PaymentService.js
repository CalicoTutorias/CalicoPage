/**
 * Payment Service - Frontend
 * Handles payment operations from the client side
 * 
 * Calls to backend:
 *   POST /api/payments/create-intent - Create payment intent
 *   GET /api/payments/[id] - Get payment details
 */

import { authFetch } from '../authFetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/** Statuses after which confirm-payment is worth retrying (server/provider down, network). */
const CONFIRM_RETRYABLE_STATUSES = new Set([0, 502, 503, 504]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * confirmWompiPayment options for a charge the bank has not settled yet (PSE,
 * Nequi, transfer): confirm-payment answers 202 PAYMENT_PENDING until Wompi
 * approves it. 8 attempts with a linear 5 s back-off ≈ 2 min 20 s; after that
 * the webhook books it whenever the bank approves.
 */
export const PENDING_CONFIRM_POLLING = { attempts: 8, retryDelayMs: 5000 };

class PaymentServiceClass {
  /**
   * Create a payment intent for booking a tutoring session
   * 
   * @param {Object} params
   * @param {number} params.studentId - Student making payment
   * @param {number} params.tutorId - Tutor receiving payment
   * @param {string} params.courseId - Course ID (UUID)
   * @param {number} params.amount - Amount in COP
   * @param {number} params.durationMinutes - Session duration
   * @param {Date} params.startTimestamp - Session start
   * @param {Date} params.endTimestamp - Session end
   * @returns {Object} Payment intent with checkout URL
   */
  async createPaymentIntent({
    studentId,
    tutorId,
    courseId,
    amount,
    durationMinutes,
    startTimestamp,
    endTimestamp,
  }) {
    const token = localStorage.getItem('calico_auth_token');
    
    const response = await fetch(`${API_BASE}/api/payments/create-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        studentId,
        tutorId,
        courseId,
        amount,
        durationMinutes,
        startTimestamp: startTimestamp.toISOString(),
        endTimestamp: endTimestamp.toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create payment intent');
    }

    return response.json();
  }

  /**
   * Get payment details
   * 
   * @param {number} paymentId - Payment ID
   * @returns {Object} Payment details
   */
  async getPayment(paymentId) {
    const token = localStorage.getItem('calico_auth_token');
    
    const response = await fetch(`${API_BASE}/api/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get payment');
    }

    return response.json();
  }

  /**
   * Get all payments for a tutor
   * 
   * @param {number|string} tutorId - Tutor ID (can be string or number)
   * @returns {Array} Array of payment objects
   */
  async getTutorPayments(tutorId) {
    if (!tutorId) {
      console.warn('[PaymentService.getTutorPayments] Missing tutorId');
      return [];
    }

    const token = localStorage.getItem('calico_auth_token');
    
    try {
      const response = await fetch(`${API_BASE}/api/payments/tutor/${tutorId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      console.log(`[PaymentService.getTutorPayments] Response status: ${response.status} for tutorId=${tutorId}`);

      if (!response.ok) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: `HTTP ${response.status}` };
        }
        console.error('[PaymentService.getTutorPayments] Error:', {
          status: response.status,
          data: errorData,
          tutorId,
        });
        return [];
      }

      const data = await response.json();
      console.log(`[PaymentService.getTutorPayments] Success: ${Array.isArray(data) ? data.length : 0} payments for tutorId=${tutorId}`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('[PaymentService.getTutorPayments] Fetch error:', error.message, error);
      return [];
    }
  }

  /**
   * Create a Wompi payment intent (used by the booking page BookingForm).
   * Calls POST /api/payments/create-intent and returns the intent object
   * with { reference, public_key, amountInCents, ... } for the Wompi widget.
   *
   * @param {Object} params
   * @param {number} params.tutorId
   * @param {number} params.studentId
   * @param {string} params.courseId
   * @param {number} params.amount       - Amount in cents (will be converted to COP)
   * @param {string} params.startTimestamp - ISO string (UTC)
   * @param {string} params.endTimestamp   - ISO string (UTC)
   * @param {Object[]} [params.attachments] - Already-uploaded S3 file metadata
   *        ({ s3Key, fileName, fileSize, mimeType }). Forwarded so it can ride
   *        the Wompi metadata and be registered after payment confirmation.
   * @param {string} [params.couponCode] - Coupon the student applied. The server
   *        recomputes the discount and signs the final amount; the returned
   *        intent carries `pricing` and `amountInCents` already discounted.
   *
   * Throws an Error whose `code` is the server's error code (e.g.
   * COUPON_EXHAUSTED on a 409) so the form can show the right message.
   * Resolves `{ free: true, reference, session, pricing }` when a 100 % coupon
   * covered the whole price: the session is already booked, skip the widget.
   */
  async createWompiPayment({ tutorId, studentId, courseId, amount, startTimestamp, endTimestamp, durationMinutes = 60, topicsToReview, attachments, couponCode }) {
    // Ensure timestamps are ISO UTC strings
    let startISO = startTimestamp;
    let endISO = endTimestamp;

    if (startTimestamp instanceof Date) {
      startISO = startTimestamp.toISOString();
    }
    if (endTimestamp instanceof Date) {
      endISO = endTimestamp.toISOString();
    }

    const { ok, status, data } = await authFetch(`${API_BASE}/api/payments/create-intent`, {
      method: 'POST',
      body: JSON.stringify({
        tutorId,
        studentId,
        courseId,
        amount: Math.round(amount / 100), // cents → COP (backend multiplies by 100 again)
        durationMinutes,
        startTimestamp: startISO,
        endTimestamp: endISO,
        topicsToReview: topicsToReview || '',
        attachments: Array.isArray(attachments) ? attachments : [],
        ...(couponCode ? { couponCode } : {}),
      }),
    });

    if (ok && data?.success) {
      // 100 % coupon: the server booked the session itself, there is nothing
      // for the Wompi widget to charge.
      if (data.free) {
        return { free: true, reference: data.reference, session: data.session ?? null, pricing: data.pricing ?? null };
      }
      return { ...data.intent, pricing: data.pricing ?? data.intent?.pricing ?? null };
    }
    const err = new Error(data?.error || 'Error al crear el intent de pago');
    err.code = data?.error || null;
    err.status = status;
    throw err;
  }

  /**
   * Confirm an APPROVED widget transaction with the server, which re-fetches it
   * from Wompi and books the session.
   *
   * When Wompi itself is unreachable the server answers 503
   * `PROVIDER_UNAVAILABLE` (after pinning the transaction on the intent and
   * alerting support), so this retries a few times with back-off before giving
   * up. The rejection carries `code`, `status` and `retryable`: a retryable
   * failure means "the charge probably went through, do NOT let the student
   * pay again" — the form must stay locked and say so.
   *
   * @param {{ reference: string, transactionId: string }} params
   * @param {{ attempts?: number, retryDelayMs?: number, sleep?: (ms: number) => Promise<void> }} [options]
   * @returns {Promise<object|null>} the server's `result` (payment + session)
   */
  async confirmWompiPayment(
    { reference, transactionId },
    { attempts = 4, retryDelayMs = 2000, sleep = defaultSleep } = {},
  ) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const { ok, status, data } = await authFetch(`${API_BASE}/api/payments/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({ reference, transactionData: { id: transactionId } }),
      });

      if (ok && data?.success) return data.result ?? null;

      const retryable = data?.retryable === true || CONFIRM_RETRYABLE_STATUSES.has(status);
      lastError = new Error(data?.message || data?.error || 'Error confirmando el pago');
      lastError.code = data?.error || null;
      lastError.status = status;
      lastError.retryable = retryable;

      if (!retryable || attempt === attempts) break;
      await sleep(retryDelayMs * attempt);
    }
    throw lastError;
  }

  /**
   * Run infra health checks in parallel. Returns { ok: boolean, failures: string[] }.
   * Called before opening the Wompi widget so we fail fast if anything is down.
   */
  async checkInfraHealth() {
    const [s3Res, wompiRes] = await Promise.all([
      authFetch(`${API_BASE}/api/health/s3`, { method: 'GET' }),
      authFetch(`${API_BASE}/api/health/wompi`, { method: 'GET' }),
    ]);

    const failures = [];
    if (!s3Res.ok || !s3Res.data?.ok) failures.push(`S3: ${s3Res.data?.error || 'no disponible'}`);
    if (!wompiRes.ok || !wompiRes.data?.ok) failures.push(`Wompi: ${wompiRes.data?.error || 'no disponible'}`);

    return { ok: failures.length === 0, failures };
  }

  /**
   * Update a payment record by ID.
   * @param {number|string} paymentId
   * @param {Object} updateData
   */
  async updatePayment(paymentId, updateData) {
    const { ok, data } = await authFetch(`${API_BASE}/api/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
    if (ok && data) return data;
    return { success: false };
  }

  /**
   * Redirect to Wompi checkout
   * 
   * @param {string} checkoutUrl - URL from createPaymentIntent response
   */
  redirectToCheckout(checkoutUrl) {
    if (typeof window !== 'undefined') {
      window.location.href = checkoutUrl;
    }
  }
}

// Export as singleton
export const PaymentService = new PaymentServiceClass();

export default PaymentService;
