/**
 * @jest-environment node
 *
 * POST /api/payments/validate-coupon — the checkout preview.
 */

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock('@/lib/auth/rateLimit', () => ({
  rateLimit: jest.fn(() => null),
}));
jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));
jest.mock('@/lib/services/coupon.service', () => ({
  previewForBooking: jest.fn(),
  isCouponError: jest.fn((err) => String(err?.code || '').startsWith('COUPON_')),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { rateLimit } = require('@/lib/auth/rateLimit');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const couponService = require('@/lib/services/coupon.service');
const { POST } = require('@/app/api/payments/validate-coupon/route');

function makeRequest(body, auth = true) {
  const headers = { 'content-type': 'application/json' };
  if (auth) headers.authorization = 'Bearer t';
  return new Request('http://localhost/api/payments/validate-coupon', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

const body = {
  code: 'promo10',
  courseId: 'course-1',
  startTimestamp: '2026-09-15T13:00:00.000Z',
  endTimestamp: '2026-09-15T14:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockReturnValue({ sub: 'student-1' });
  resolveSessionAmount.mockResolvedValue({ amount: 60000, pricePerHour: 60000, hours: 1 });
  couponService.previewForBooking.mockResolvedValue({
    coupon: { id: 'c1', code: 'PROMO10', description: 'Promo', discountType: 'PERCENT', discountValue: 10 },
    pricing: { originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: 'CALICO', capped: false, applicable: true },
  });
});

it('requires authentication', async () => {
  authenticateRequest.mockReturnValue(NextResponse.json({ success: false }, { status: 401 }));
  const res = await POST(makeRequest(body, false));
  expect(res.status).toBe(401);
  expect(couponService.previewForBooking).not.toHaveBeenCalled();
});

it('rate-limits per user', async () => {
  await POST(makeRequest(body));
  expect(rateLimit).toHaveBeenCalledWith('coupon-validate:student-1', expect.objectContaining({ max: 20 }));
});

it('returns the preview without exposing limits, counters or the payout base', async () => {
  const res = await POST(makeRequest(body));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json).toEqual({
    success: true,
    valid: true,
    coupon: { code: 'PROMO10', description: 'Promo', discountType: 'PERCENT', discountValue: 10 },
    pricing: { originalAmount: 60000, discountAmount: 6000, amount: 54000, capped: false },
  });
  expect(couponService.previewForBooking).toHaveBeenCalledWith({
    code: 'promo10', userId: 'student-1', originalAmount: 60000,
  });
});

it('answers valid:false with the reason for a rejected coupon (200, not an error)', async () => {
  couponService.previewForBooking.mockRejectedValue(Object.assign(new Error('x'), { code: 'COUPON_EXPIRED' }));
  const res = await POST(makeRequest(body));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, valid: false, reason: 'COUPON_EXPIRED' });
});

it('validates the body', async () => {
  const res = await POST(makeRequest({ ...body, startTimestamp: 'not-a-date' }));
  expect(res.status).toBe(400);
  expect(couponService.previewForBooking).not.toHaveBeenCalled();
});

it('maps pricing errors (unknown course) to 404', async () => {
  resolveSessionAmount.mockRejectedValue(Object.assign(new Error('Course not found'), { name: 'PricingError', code: 'COURSE_NOT_FOUND' }));
  const res = await POST(makeRequest(body));
  expect(res.status).toBe(404);
});
