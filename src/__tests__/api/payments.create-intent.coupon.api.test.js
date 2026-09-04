/**
 * @jest-environment node
 *
 * POST /api/payments/create-intent — coupon path.
 *
 * The client only sends `couponCode`. The route must: mint the reference
 * first, reserve the hold through coupon.service, sign the DISCOUNTED total,
 * ignore any client-sent discount, answer 409 with the reason when the
 * coupon is rejected, and release the hold if the intent cannot be created.
 */

jest.mock('@/lib/services/wompi.service', () => ({
  createPaymentIntent: jest.fn(),
  generateReference: jest.fn(),
}));
jest.mock('@/lib/services/coupon.service', () => ({
  reserveForIntent: jest.fn(),
  releaseByReference: jest.fn(),
  isCouponError: jest.fn((err) => String(err?.code || '').startsWith('COUPON_')),
  COUPON_ERROR: { INVALID: 'COUPON_INVALID' },
}));
jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));

const WompiService = require('@/lib/services/wompi.service');
const couponService = require('@/lib/services/coupon.service');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { POST } = require('@/app/api/payments/create-intent/route');

function makeRequest(body) {
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

const body = {
  tutorId: 'tutor-1',
  courseId: 'course-1',
  startTimestamp: '2026-09-15T13:00:00.000Z',
  endTimestamp: '2026-09-15T14:00:00.000Z',
  topicsToReview: 'Integrales',
  attachments: [],
  couponCode: ' promo10 ',
};

const PRICING = {
  originalAmount: 80000, discountAmount: 8000, finalAmount: 72000, tutorPayoutBase: 80000, absorber: 'CALICO', capped: false, applicable: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  authenticateRequest.mockReturnValue({ sub: 'student-1' });
  resolveSessionAmount.mockResolvedValue({ amount: 80000, pricePerHour: 80000, hours: 1 });
  WompiService.generateReference.mockReturnValue('TXN-X');
  WompiService.createPaymentIntent.mockResolvedValue({ reference: 'TXN-X', checkoutUrl: 'https://checkout/x', amountInCents: 7200000 });
  couponService.reserveForIntent.mockResolvedValue({
    coupon: { id: 'coupon-1', code: 'PROMO10' },
    pricing: PRICING,
    redemptionId: 'red-1',
  });
});

describe('coupon applied', () => {
  it('reserves the hold under a pre-minted reference and signs the discounted total', async () => {
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);

    expect(couponService.reserveForIntent).toHaveBeenCalledWith({
      code: 'promo10',            // trimmed here, normalised by the service
      userId: 'student-1',        // from the JWT, never the body
      originalAmount: 80000,      // server price, not anything client-sent
      intentReference: 'TXN-X',
    });

    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(72000);
    expect(passed.reference).toBe('TXN-X');
    expect(passed.discount).toEqual({
      couponId: 'coupon-1',
      couponCode: 'PROMO10',
      absorber: 'CALICO',
      redemptionId: 'red-1',
      originalAmount: 80000,
      discountAmount: 8000,
      tutorPayoutBase: 80000,
    });

    const json = await res.json();
    expect(json.pricing).toEqual({ originalAmount: 80000, discountAmount: 8000, amount: 72000, couponCode: 'PROMO10' });
  });

  it('ignores any client-sent discount or amount', async () => {
    await POST(makeRequest({ ...body, amount: 1, discountAmount: 79999, pricing: { amount: 1 } }));
    expect(couponService.reserveForIntent.mock.calls[0][0].originalAmount).toBe(80000);
    expect(WompiService.createPaymentIntent.mock.calls[0][0].amount).toBe(72000);
  });

  it('answers 409 with the reason when the coupon is rejected, creating nothing', async () => {
    couponService.reserveForIntent.mockRejectedValue(Object.assign(new Error('x'), { code: 'COUPON_EXHAUSTED' }));

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ success: false, error: 'COUPON_EXHAUSTED' });
    expect(WompiService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('rejects absurdly long codes before touching the service', async () => {
    const res = await POST(makeRequest({ ...body, couponCode: 'A'.repeat(40) }));
    expect(res.status).toBe(400);
    expect(couponService.reserveForIntent).not.toHaveBeenCalled();
  });

  it('releases the hold when the intent cannot be created', async () => {
    WompiService.createPaymentIntent.mockRejectedValue(new Error('wompi down'));

    const res = await POST(makeRequest(body));
    expect(res.status).toBe(500);
    expect(couponService.releaseByReference).toHaveBeenCalledWith('TXN-X');
  });
});

describe('no coupon', () => {
  it('does not touch the coupon service and signs the full price', async () => {
    const { couponCode, ...noCoupon } = body;
    const res = await POST(makeRequest(noCoupon));
    expect(res.status).toBe(200);
    expect(couponService.reserveForIntent).not.toHaveBeenCalled();
    expect(WompiService.generateReference).not.toHaveBeenCalled();
    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(80000);
    expect(passed.discount).toBeNull();
    const json = await res.json();
    expect(json.pricing).toEqual({ originalAmount: 80000, discountAmount: 0, amount: 80000, couponCode: null });
  });
});
