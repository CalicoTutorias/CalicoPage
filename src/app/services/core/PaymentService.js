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
   * Create a Wompi payment intent (used by SessionConfirmationModal).
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
   */
  async createWompiPayment({ tutorId, studentId, courseId, amount, startTimestamp, endTimestamp, durationMinutes = 60, topicsToReview, attachments }) {
    // Ensure timestamps are ISO UTC strings
    let startISO = startTimestamp;
    let endISO = endTimestamp;

    if (startTimestamp instanceof Date) {
      startISO = startTimestamp.toISOString();
    }
    if (endTimestamp instanceof Date) {
      endISO = endTimestamp.toISOString();
    }

    const { ok, data } = await authFetch(`${API_BASE}/api/payments/create-intent`, {
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
        attachments: attachments || [],
      }),
    });

    if (ok && data?.success) return data.intent;
    throw new Error(data?.error || 'Error al crear el intent de pago');
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

  /**
   * Handle payment confirmation after Wompi redirect
   * Called from /payments/confirm page
   * 
   * @param {URLSearchParams} params - Query parameters from Wompi redirect
   * @returns {Object} Confirmation status
   */
  async handlePaymentConfirmation(params) {
    const reference = params.get('reference') || params.get('reference_id');
    const status = params.get('status');
    
    // Map Wompi status to readable format
    const statusMap = {
      'APPROVED': 'success',
      'DECLINED': 'declined',
      'ERROR': 'error',
      'PENDING': 'pending',
    };

    return {
      reference,
      status: statusMap[status] || 'unknown',
      message: this.getStatusMessage(status),
    };
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(status) {
    const messages = {
      'APPROVED': ' ¡Pago exitoso! Tu sesión ha sido reservada.',
      'DECLINED': ' Tu pago fue rechazado. Por favor, intenta de nuevo.',
      'ERROR': '️ Hubo un error procesando tu pago. Contacta soporte.',
      'PENDING': ' Tu pago aún está siendo procesado. Espera un momento.',
    };

    return messages[status] || ' Estado de pago desconocido.';
  }
}

// Export as singleton
export const PaymentService = new PaymentServiceClass();

export default PaymentService;
