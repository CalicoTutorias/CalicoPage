/**
 * CouponService — frontend
 *
 * Student side: preview a coupon for a booking (the checkout shows
 * "Antes · Ahora · Ahorras"). Admin side: CRUD + usage detail.
 * All calls go through authFetch; nothing here computes money — every
 * figure comes from the server.
 *
 * Backend:
 *   POST   /api/payments/validate-coupon
 *   GET    /api/admin/coupons?status=&search=
 *   POST   /api/admin/coupons
 *   GET    /api/admin/coupons/:id
 *   PUT    /api/admin/coupons/:id
 *   DELETE /api/admin/coupons/:id
 */

import { authFetch } from '../authFetch';

const API_BASE_URL = process.env.API_URL || '/api';

class CouponServiceClass {
  // ===== Student =====

  /**
   * Preview a coupon for a booking. Never throws.
   * @returns {Promise<{ ok: boolean, valid: boolean, reason?: string, coupon?: object, pricing?: object, error?: string }>}
   */
  async validateForBooking({ code, courseId, startTimestamp, endTimestamp }) {
    const toISO = (v) => (v instanceof Date ? v.toISOString() : v);
    const { ok, status, data } = await authFetch(`${API_BASE_URL}/payments/validate-coupon`, {
      method: 'POST',
      body: JSON.stringify({
        code,
        courseId,
        startTimestamp: toISO(startTimestamp),
        endTimestamp: toISO(endTimestamp),
      }),
    });
    if (ok && data?.success) {
      return {
        ok: true,
        valid: Boolean(data.valid),
        reason: data.reason ?? null,
        coupon: data.coupon ?? null,
        pricing: data.pricing ?? null,
      };
    }
    return {
      ok: false,
      valid: false,
      reason: status === 429 ? 'RATE_LIMITED' : null,
      error: data?.error || null,
    };
  }

  // ===== Admin =====

  async listCoupons({ status = 'all', search = '' } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/coupons?${params.toString()}`);
    if (ok && data?.success) {
      return { success: true, coupons: data.coupons || [], total: data.total || 0 };
    }
    return { success: false, coupons: [], total: 0, error: data?.error };
  }

  async getCoupon(id) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/coupons/${encodeURIComponent(id)}`);
    if (ok && data?.success) {
      return { success: true, coupon: data.coupon, redemptions: data.redemptions || [] };
    }
    return { success: false, error: data?.error };
  }

  async createCoupon(payload) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/coupons`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (ok && data?.success) return { success: true, coupon: data.coupon };
    return { success: false, error: data?.error, code: data?.code };
  }

  /** Partial update; `{ isActive }` alone toggles activation. */
  async updateCoupon(id, payload) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (ok && data?.success) return { success: true, coupon: data.coupon };
    return { success: false, error: data?.error, code: data?.code };
  }

  async deleteCoupon(id) {
    const { ok, data } = await authFetch(`${API_BASE_URL}/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (ok && data?.success) return { success: true, mode: data.mode };
    return { success: false, error: data?.error, code: data?.code };
  }
}

export const CouponService = new CouponServiceClass();

export default CouponService;
