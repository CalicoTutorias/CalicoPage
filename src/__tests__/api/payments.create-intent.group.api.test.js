/**
 * @jest-environment node
 *
 * POST /api/payments/create-intent — group booking.
 *
 * The client sends `groupSize` (people, counting the student) and optionally
 * `inviteEmails`. The route must: validate both before anything is charged,
 * have the slot rules check the tutor's group limit, sign base price +
 * surcharge (never a client amount), keep the surcharge out of the coupon's
 * reach and freeze the group into the intent.
 */

jest.mock('@/lib/services/session.service', () => ({
  assertSlotBookable: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/lib/services/session-checkout.service', () => ({
  bookFreeSession: jest.fn(),
}));
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
jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
}));

const WompiService = require('@/lib/services/wompi.service');
const sessionService = require('@/lib/services/session.service');
const sessionCheckout = require('@/lib/services/session-checkout.service');
const couponService = require('@/lib/services/coupon.service');
const userRepo = require('@/lib/repositories/user.repository');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { withSurcharge } = require('@/lib/payments/coupon-math');
const { POST } = require('@/app/api/payments/create-intent/route');

function makeRequest(body) {
  return new Request('http://localhost/api/payments/create-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

const base = {
  tutorId: 'tutor-1',
  courseId: 'course-1',
  startTimestamp: '2026-09-15T13:00:00.000Z',
  endTimestamp: '2026-09-15T14:00:00.000Z',
  topicsToReview: 'Integrales',
  attachments: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  authenticateRequest.mockReturnValue({ sub: 'student-1' });
  // 3 people, 1 h: base 50 000 + 2 × 10 000 = 70 000
  resolveSessionAmount.mockResolvedValue({
    amount: 50000, pricePerHour: 50000, hours: 1, groupSize: 3, groupSurcharge: 20000, totalAmount: 70000,
  });
  userRepo.findById.mockImplementation(async (id) => (
    id === 'student-1' ? { id, email: 'me@test.co' } : { id, email: 'tutor@test.co' }
  ));
  WompiService.generateReference.mockReturnValue('TXN-G');
  WompiService.createPaymentIntent.mockResolvedValue({ reference: 'TXN-G', checkoutUrl: 'https://checkout/g', amountInCents: 7000000 });
});

describe('group size', () => {
  it.each([0, 7, 2.5, 'tres', -1])('refuses %p before pricing or charging', async (groupSize) => {
    const res = await POST(makeRequest({ ...base, groupSize }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('GROUP_SIZE_INVALID');
    expect(sessionService.assertSlotBookable).not.toHaveBeenCalled();
    expect(WompiService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('answers 409 without charging when the tutor accepts fewer people', async () => {
    const refusal = Object.assign(new Error('max 2'), { code: 'GROUP_SIZE_NOT_ALLOWED' });
    sessionService.assertSlotBookable.mockRejectedValueOnce(refusal);

    const res = await POST(makeRequest({ ...base, groupSize: 3 }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('GROUP_SIZE_NOT_ALLOWED');
    expect(WompiService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('keeps an individual booking exactly as before', async () => {
    resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1, groupSize: 1, groupSurcharge: 0, totalAmount: 50000 });

    const res = await POST(makeRequest(base));

    expect(res.status).toBe(200);
    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(50000);
    expect(passed.group).toBeNull();
    expect(userRepo.findById).not.toHaveBeenCalled();
  });
});

describe('price', () => {
  it('signs base + surcharge computed on the server and freezes the group', async () => {
    const res = await POST(makeRequest({
      ...base, groupSize: 3, inviteEmails: [' Ana@Test.co ', 'beto@test.co'], amount: 1,
    }));
    expect(res.status).toBe(200);

    expect(sessionService.assertSlotBookable).toHaveBeenCalledWith('student-1', expect.objectContaining({ groupSize: 3 }));
    expect(resolveSessionAmount).toHaveBeenCalledWith(expect.objectContaining({ groupSize: 3 }));

    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(70000);
    expect(passed.group).toEqual({ groupSize: 3, groupSurcharge: 20000, inviteEmails: ['ana@test.co', 'beto@test.co'] });

    const json = await res.json();
    expect(json.pricing).toMatchObject({ originalAmount: 70000, amount: 70000, groupSize: 3, groupSurcharge: 20000 });
  });

  it('gives the coupon only the base price to discount', async () => {
    const basePricing = { originalAmount: 50000, discountAmount: 5000, finalAmount: 45000, tutorPayoutBase: 50000, absorber: 'CALICO', capped: false, applicable: true };
    couponService.reserveForIntent.mockResolvedValue({
      coupon: { id: 'coupon-1', code: 'PROMO10' },
      pricing: withSurcharge(basePricing, 20000),
      redemptionId: 'red-1',
    });

    const res = await POST(makeRequest({ ...base, groupSize: 3, couponCode: 'PROMO10' }));
    expect(res.status).toBe(200);

    expect(couponService.reserveForIntent).toHaveBeenCalledWith(expect.objectContaining({ originalAmount: 50000, surcharge: 20000 }));
    const passed = WompiService.createPaymentIntent.mock.calls[0][0];
    expect(passed.amount).toBe(65000);
    expect(passed.discount).toMatchObject({ originalAmount: 70000, discountAmount: 5000, tutorPayoutBase: 70000 });
  });

  it('charges the surcharge through Wompi even with a 100 % coupon', async () => {
    couponService.reserveForIntent.mockResolvedValue({
      coupon: { id: 'coupon-1', code: 'CORTESIA' },
      pricing: { originalAmount: 70000, discountAmount: 50000, finalAmount: 20000, tutorPayoutBase: 70000, absorber: 'CALICO', capped: false, applicable: true },
      redemptionId: 'red-1',
    });

    const res = await POST(makeRequest({ ...base, groupSize: 3, couponCode: 'CORTESIA' }));

    expect(res.status).toBe(200);
    expect(sessionCheckout.bookFreeSession).not.toHaveBeenCalled();
    expect(WompiService.createPaymentIntent.mock.calls[0][0].amount).toBe(20000);
  });
});

describe('guests', () => {
  it.each([
    ['an invalid email', ['nope'], 'INVITE_INVALID_EMAIL'],
    ['the student themself', ['ME@test.co'], 'INVITE_SELF'],
    ['the tutor', ['tutor@test.co'], 'INVITE_SELF'],
    ['a repeated email', ['a@b.co', 'A@b.co'], 'INVITE_DUPLICATE'],
    ['more guests than seats', ['a@b.co', 'c@d.co', 'e@f.co'], 'INVITE_TOO_MANY'],
  ])('refuses %s before charging', async (_label, inviteEmails, code) => {
    const res = await POST(makeRequest({ ...base, groupSize: 3, inviteEmails }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(code);
    expect(WompiService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('books a group without guests yet (they can be invited later)', async () => {
    const res = await POST(makeRequest({ ...base, groupSize: 3 }));
    expect(res.status).toBe(200);
    expect(WompiService.createPaymentIntent.mock.calls[0][0].group.inviteEmails).toEqual([]);
  });

  it('ignores guest emails on an individual booking', async () => {
    resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1, groupSize: 1, groupSurcharge: 0, totalAmount: 50000 });
    const res = await POST(makeRequest({ ...base, inviteEmails: ['a@b.co'] }));
    expect(res.status).toBe(200);
    expect(WompiService.createPaymentIntent.mock.calls[0][0].group).toBeNull();
  });
});
