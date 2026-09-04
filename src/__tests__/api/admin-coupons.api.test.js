/**
 * @jest-environment node
 *
 * Admin coupon routes: guard, validation, and service error mapping.
 *   GET/POST   /api/admin/coupons
 *   GET/PUT/DELETE /api/admin/coupons/[id]
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/coupon.service', () => ({
  listCoupons: jest.fn(),
  createCoupon: jest.fn(),
  getCouponDetail: jest.fn(),
  updateCoupon: jest.fn(),
  deleteCoupon: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const couponService = require('@/lib/services/coupon.service');
const listRoute = require('@/app/api/admin/coupons/route');
const idRoute = require('@/app/api/admin/coupons/[id]/route');

const ID = '3f4c8d6a-1b2c-4d5e-8f90-123456789abc';

function req(method, url, body) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

describe('guard', () => {
  it('refuses non-admins on every verb', async () => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));

    expect((await listRoute.GET(req('GET', '/api/admin/coupons'))).status).toBe(403);
    expect((await listRoute.POST(req('POST', '/api/admin/coupons', {}))).status).toBe(403);
    expect((await idRoute.GET(req('GET', `/api/admin/coupons/${ID}`), params)).status).toBe(403);
    expect((await idRoute.PUT(req('PUT', `/api/admin/coupons/${ID}`, { isActive: false }), params)).status).toBe(403);
    expect((await idRoute.DELETE(req('DELETE', `/api/admin/coupons/${ID}`), params)).status).toBe(403);

    expect(couponService.listCoupons).not.toHaveBeenCalled();
    expect(couponService.createCoupon).not.toHaveBeenCalled();
    expect(couponService.deleteCoupon).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/coupons', () => {
  it('lists with the status/search filters', async () => {
    couponService.listCoupons.mockResolvedValue({ items: [{ id: 'a' }], total: 1 });
    const res = await listRoute.GET(req('GET', '/api/admin/coupons?status=expired&search=pro'));
    expect(res.status).toBe(200);
    expect(couponService.listCoupons).toHaveBeenCalledWith({ status: 'expired', search: 'pro' });
    expect(await res.json()).toEqual({ success: true, coupons: [{ id: 'a' }], total: 1 });
  });

  it('rejects an unknown status filter', async () => {
    const res = await listRoute.GET(req('GET', '/api/admin/coupons?status=weird'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/coupons', () => {
  const valid = { code: 'PROMO10', discountType: 'PERCENT', discountValue: 10, absorber: 'SHARED', maxRedemptions: 10 };

  it('creates with the admin from the guard, never from the body', async () => {
    couponService.createCoupon.mockResolvedValue({ id: 'new', code: 'PROMO10' });
    const res = await listRoute.POST(req('POST', '/api/admin/coupons', { ...valid, createdById: 'someone-else' }));
    expect(res.status).toBe(201);
    expect(couponService.createCoupon).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      data: expect.objectContaining({ code: 'PROMO10', absorber: 'SHARED', maxRedemptions: 10 }),
    }));
    expect(couponService.createCoupon.mock.calls[0][0].data.createdById).toBeUndefined();
  });

  it.each([
    ['a bad discount type', { ...valid, discountType: 'HALF' }],
    ['a non-integer value', { ...valid, discountValue: 10.5 }],
    ['a bad absorber', { ...valid, absorber: 'TUTOR' }],
    ['a too-short code', { ...valid, code: 'AB' }],
  ])('400s on %s', async (_label, body) => {
    const res = await listRoute.POST(req('POST', '/api/admin/coupons', body));
    expect(res.status).toBe(400);
    expect(couponService.createCoupon).not.toHaveBeenCalled();
  });

  it('maps a duplicate code to 409', async () => {
    couponService.createCoupon.mockRejectedValue(Object.assign(new Error('dup'), { code: 'COUPON_CODE_EXISTS' }));
    const res = await listRoute.POST(req('POST', '/api/admin/coupons', valid));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ success: false, code: 'COUPON_CODE_EXISTS' });
  });

  it('maps a service validation error to 400', async () => {
    couponService.createCoupon.mockRejectedValue(Object.assign(new Error('fechas'), { code: 'VALIDATION_ERROR' }));
    const res = await listRoute.POST(req('POST', '/api/admin/coupons', valid));
    expect(res.status).toBe(400);
  });
});

describe('/api/admin/coupons/[id]', () => {
  it('rejects a malformed id on every verb', async () => {
    const bad = { params: Promise.resolve({ id: 'not-a-uuid' }) };
    expect((await idRoute.GET(req('GET', '/x'), bad)).status).toBe(400);
    expect((await idRoute.PUT(req('PUT', '/x', { isActive: true }), bad)).status).toBe(400);
    expect((await idRoute.DELETE(req('DELETE', '/x'), bad)).status).toBe(400);
  });

  it('GET returns the detail with redemptions', async () => {
    couponService.getCouponDetail.mockResolvedValue({ coupon: { id: ID }, redemptions: [{ id: 'r1' }] });
    const res = await idRoute.GET(req('GET', `/api/admin/coupons/${ID}`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, coupon: { id: ID }, redemptions: [{ id: 'r1' }] });
  });

  it('GET 404s on an unknown coupon', async () => {
    couponService.getCouponDetail.mockRejectedValue(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    const res = await idRoute.GET(req('GET', `/api/admin/coupons/${ID}`), params);
    expect(res.status).toBe(404);
  });

  it('PUT forwards a partial update (toggle) and 400s an empty body', async () => {
    couponService.updateCoupon.mockResolvedValue({ id: ID, isActive: false });
    const res = await idRoute.PUT(req('PUT', `/api/admin/coupons/${ID}`, { isActive: false }), params);
    expect(res.status).toBe(200);
    expect(couponService.updateCoupon).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', id: ID, data: { isActive: false },
    }));

    const empty = await idRoute.PUT(req('PUT', `/api/admin/coupons/${ID}`, {}), params);
    expect(empty.status).toBe(400);
  });

  it('PUT maps a locked code to 409', async () => {
    couponService.updateCoupon.mockRejectedValue(Object.assign(new Error('locked'), { code: 'COUPON_CODE_LOCKED' }));
    const res = await idRoute.PUT(req('PUT', `/api/admin/coupons/${ID}`, { code: 'NEWCODE' }), params);
    expect(res.status).toBe(409);
  });

  it('DELETE returns the mode chosen by the service', async () => {
    couponService.deleteCoupon.mockResolvedValue({ id: ID, code: 'PROMO10', mode: 'soft', redemptions: 2 });
    const res = await idRoute.DELETE(req('DELETE', `/api/admin/coupons/${ID}`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: ID, code: 'PROMO10', mode: 'soft', redemptions: 2 });
    expect(couponService.deleteCoupon).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', id: ID }));
  });
});
