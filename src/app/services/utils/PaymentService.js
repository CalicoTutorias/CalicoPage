import { authFetch } from '../authFetch';

const API_URL = '/api';

export const PaymentService = {
  /**
   * Create a Wompi payment intent
   * @returns {Promise<{ success: boolean, error?: string, [key: string]: any }>}
   */
  createWompiPayment: async (paymentData) => {
    const { ok, data } = await authFetch(`${API_URL}/payments/wompi/create`, {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });

    if (ok && data) return data;
    return { success: false, error: data?.message || 'Error al iniciar el pago con Wompi' };
  },

  getPaymentHistory: async () => {
    // No hay rutas /api/payments/* en este monolito; evitar 404 hasta integrar pagos.
    return [];
  },

  getPaymentsByStudent: async (studentId) => {
    return PaymentService.getPaymentHistory(studentId);
  },

  getTutorPayments: async () => {
    // No hay rutas /api/payments/* en este monolito; evitar 404 hasta integrar pagos.
    return [];
  },

  getPaymentDetails: async (paymentId) => {
    const { ok, data } = await authFetch(`${API_URL}/payments/${paymentId}`);
    if (ok && data) return data;
    return null;
  },

  /**
   * Update a payment
   * @returns {Promise<{ success: boolean, error?: string, [key: string]: any }>}
   */
  updatePayment: async (paymentId, updateData) => {
    const { ok, data } = await authFetch(`${API_URL}/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });

    if (ok && data) return data;
    return { success: false, error: data?.message || 'Error updating payment' };
  },
};
