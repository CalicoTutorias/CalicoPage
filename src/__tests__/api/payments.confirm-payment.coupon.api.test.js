/**
 * @jest-environment node
 *
 * POST /api/payments/confirm-payment — amount reconciliation with a coupon.
 * The expected charge is the course price recomputed NOW minus the discount
 * frozen in the server-side intent snapshot; the client body never matters.
 */

jest.mock('@/lib/services/wompi.service', () => ({
  processSuccessfulPayment: jest.fn(),
}));
jest.mock('@/lib/services/wompi-api.service', () => ({
  fetchTransaction: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  findByReference: jest.fn(),
}));
jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));
jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const wompiService = require('@/lib/services/wompi.service');
const wompiApi = require('@/lib/services/wompi-api.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { POST } = require('@/app/api/payments/confirm-payment/route');

function buildRequest(body) {
  return new Request('http://localhost/api/payments/confirm-payment', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
    body: JSON.stringify(body),
  });
}

const CORE = {
  studentId: '2',
  tutorId: '3',
  courseId: 'course-uuid',
  startTimestamp: '2026-09-15T13:00:00.000Z',
  endTimestamp: '2026-09-15T14:00:00.000Z',
  topicsToReview: 'Integrales',
  attachments: '[]',
};

const SNAPSHOT = {
  couponId: 'coupon-1',
  couponCode: 'PROMO10',
  couponAbsorber: 'CALICO',
  originalAmount: '50000',
  discountAmount: '5000',
  tutorPayoutBase: '50000',
};

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockReturnValue({ sub: '2' });
  resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1 });
  // Wompi's lookup does not echo metadata → everything comes from the stored intent.
  wompiApi.fetchTransaction.mockResolvedValue({
    id: 'wompi-1', status: 'APPROVED', amount_in_cents: 4500000, reference: 'TXN-1', metadata: {},
  });
  paymentIntentRepo.findByReference.mockResolvedValue({ metadata: { ...CORE, ...SNAPSHOT } });
  wompiService.processSuccessfulPayment.mockResolvedValue({ payment: { id: 'p1' }, session: { id: 's1' } });
});

it('accepts the discounted amount (price − snapshot discount) and processes the payment', async () => {
  const res = await POST(buildRequest({ reference: 'TXN-1', transactionData: { id: 'wompi-1' } }));
  expect(res.status).toBe(200);
  expect(paymentIntentRepo.findByReference).toHaveBeenCalledWith('TXN-1');
  expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
});

it('rejects the full list price when the intent carried a discount', async () => {
  wompiApi.fetchTransaction.mockResolvedValue({
    id: 'wompi-1', status: 'APPROVED', amount_in_cents: 5000000, reference: 'TXN-1', metadata: {},
  });
  const res = await POST(buildRequest({ reference: 'TXN-1', transactionData: { id: 'wompi-1' } }));
  expect(res.status).toBe(400);
  expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
});

it('rejects a discounted amount when the intent carried NO coupon', async () => {
  paymentIntentRepo.findByReference.mockResolvedValue({ metadata: { ...CORE } });
  const res = await POST(buildRequest({ reference: 'TXN-1', transactionData: { id: 'wompi-1' } }));
  expect(res.status).toBe(400);
  expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
});

it('surfaces a payment refused at processing time (limits exceeded) as 409 with the code', async () => {
  wompiService.processSuccessfulPayment.mockRejectedValue(
    Object.assign(new Error('refused'), { code: 'COUPON_LIMIT_EXCEEDED', reason: 'COUPON_USER_LIMIT' }),
  );
  const res = await POST(buildRequest({ reference: 'TXN-1', transactionData: { id: 'wompi-1' } }));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ success: false, error: 'COUPON_LIMIT_EXCEEDED' });
});

it('takes the discount from the stored intent, never from the client body', async () => {
  wompiApi.fetchTransaction.mockResolvedValue({
    id: 'wompi-1', status: 'APPROVED', amount_in_cents: 100000, reference: 'TXN-1', metadata: {},
  });
  const res = await POST(buildRequest({
    reference: 'TXN-1',
    transactionData: { id: 'wompi-1', metadata: { ...CORE, discountAmount: '49000' } },
  }));
  expect(res.status).toBe(400);
  expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
});
