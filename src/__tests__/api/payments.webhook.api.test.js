/**
 * @jest-environment node
 *
 * POST /api/payments/webhook — the server-to-server confirmation path.
 * Wompi's transaction lookup does not echo our metadata, so the persisted
 * intent supplies both the booking fields and the coupon snapshot used to
 * reconcile the paid amount.
 */

jest.mock('@/lib/services/wompi-api.service', () => ({
  verifyEventChecksum: jest.fn(),
  fetchTransaction: jest.fn(),
}));
jest.mock('@/lib/services/wompi.service', () => ({
  processSuccessfulPayment: jest.fn(),
  handleFailedPayment: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  findByReference: jest.fn(),
}));
jest.mock('@/lib/payments/pricing', () => ({
  resolveSessionAmount: jest.fn(),
}));

const wompiApi = require('@/lib/services/wompi-api.service');
const wompiService = require('@/lib/services/wompi.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const { resolveSessionAmount } = require('@/lib/payments/pricing');
const { POST } = require('@/app/api/payments/webhook/route');

function webhookRequest(body) {
  return new Request('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const EVENT = { event: 'transaction.updated', data: { transaction: { id: 'wompi-1' } }, timestamp: 1 };

const CORE = {
  studentId: '2', tutorId: '3', courseId: 'course-uuid',
  startTimestamp: '2026-09-15T13:00:00.000Z', endTimestamp: '2026-09-15T14:00:00.000Z',
};
const SNAPSHOT = {
  couponId: 'coupon-1', couponCode: 'PROMO10', couponAbsorber: 'CALICO',
  originalAmount: '50000', discountAmount: '5000', tutorPayoutBase: '50000',
};

function transaction(amountInCents, status = 'APPROVED') {
  return { id: 'wompi-1', status, amount_in_cents: amountInCents, reference: 'TXN-1', metadata: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WOMPI_EVENTS_SECRET = 'events-secret';
  wompiApi.verifyEventChecksum.mockReturnValue(true);
  resolveSessionAmount.mockResolvedValue({ amount: 50000, pricePerHour: 50000, hours: 1 });
  paymentIntentRepo.findByReference.mockResolvedValue({ metadata: { ...CORE, ...SNAPSHOT } });
  wompiService.processSuccessfulPayment.mockResolvedValue({ session: { id: 's1' } });
});

it('rejects a bad checksum before touching anything', async () => {
  wompiApi.verifyEventChecksum.mockReturnValue(false);
  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(401);
  expect(wompiApi.fetchTransaction).not.toHaveBeenCalled();
});

it('reconciles against price − snapshot discount using the STORED intent and processes', async () => {
  wompiApi.fetchTransaction.mockResolvedValue(transaction(4500000));

  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true });
  expect(resolveSessionAmount).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'course-uuid' }));
  expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
});

it('flags a mismatch (paid full price on a discounted intent) and does NOT process', async () => {
  wompiApi.fetchTransaction.mockResolvedValue(transaction(5000000));

  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(200); // Wompi must not retry
  expect(await res.json()).toMatchObject({ success: false, error: expect.stringMatching(/mismatch/i) });
  expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
});

it('without a coupon the full price is expected', async () => {
  paymentIntentRepo.findByReference.mockResolvedValue({ metadata: { ...CORE } });
  wompiApi.fetchTransaction.mockResolvedValue(transaction(5000000));

  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(200);
  expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
});

it('acknowledges a payment refused at processing time (200, no retry) without processing it twice', async () => {
  wompiApi.fetchTransaction.mockResolvedValue(transaction(4500000));
  wompiService.processSuccessfulPayment.mockRejectedValue(
    Object.assign(new Error('refused'), { code: 'COUPON_LIMIT_EXCEEDED' }),
  );

  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: false });
  expect(wompiService.processSuccessfulPayment).toHaveBeenCalledTimes(1);
});

it('a declined transaction goes to handleFailedPayment (which releases the coupon hold)', async () => {
  wompiApi.fetchTransaction.mockResolvedValue(transaction(4500000, 'DECLINED'));

  const res = await POST(webhookRequest(EVENT));
  expect(res.status).toBe(200);
  expect(wompiService.handleFailedPayment).toHaveBeenCalledWith(expect.objectContaining({
    wompiTransactionId: 'wompi-1', reference: 'TXN-1', reason: 'DECLINED',
  }));
  expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
});
