/**
 * BatchDiscountService — frontend ("tutorías en bloque")
 *
 * Student: quote a booking (price of each hour, block discount, whether one
 * more consecutive hour fits). Admin: read/save the block-discount config.
 * Nothing here computes money that is charged — every figure the checkout
 * signs comes from the server.
 *
 * Backend:
 *   POST /api/payments/quote
 *   GET  /api/admin/batch-discount
 *   PUT  /api/admin/batch-discount
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';
const toISO = (v) => (v instanceof Date ? v.toISOString() : v);

class BatchDiscountServiceClass {
  /**
   * Quote a booking. Never throws.
   * @returns {Promise<{ ok: boolean, quote?: object, maxConsecutiveHours?: number, next?: object|null }>}
   */
  async quoteBooking({ tutorId, courseId, startTimestamp, endTimestamp }) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/payments/quote`, {
      method: 'POST',
      body: JSON.stringify({
        tutorId: String(tutorId),
        courseId,
        startTimestamp: toISO(startTimestamp),
        endTimestamp: toISO(endTimestamp),
      }),
    });
    if (ok && data?.success) {
      return { ok: true, quote: data.quote, maxConsecutiveHours: data.maxConsecutiveHours, next: data.next ?? null };
    }
    return { ok: false, error: data?.error || null };
  }

  async getConfig() {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/batch-discount`);
    if (ok && data?.success) return { success: true, config: data.config, changes: data.changes || [] };
    return { success: false, error: data?.error };
  }

  async saveConfig(config) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/batch-discount`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    if (ok && data?.success) return { success: true, config: data.config };
    return { success: false, error: data?.error || 'GENERIC' };
  }
}

export const BatchDiscountService = new BatchDiscountServiceClass();
export default BatchDiscountService;
