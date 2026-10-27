/**
 * @jest-environment node
 *
 * payment-reconcile.service — admin replay of an approved Wompi transaction
 * that never produced its payment + session (Wompi API down at confirmation).
 * Runs the real checkout contract (checkout.js) against mocked fulfillers.
 */

jest.mock('@/lib/services/wompi-api.service', () => ({ fetchTransaction: jest.fn() }));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({ findByReference: jest.fn() }));
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));
jest.mock('@/lib/services/event-checkout.service', () => ({ fulfilPaidRegistration: jest.fn() }));
jest.mock('@/lib/payments/pricing', () => ({ resolveSessionAmount: jest.fn() }));

const wompiApi = require('@/lib/services/wompi-api.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const wompiService = require('@/lib/services/wompi.service');
const { fulfilPaidRegistration } = require('@/lib/services/event-checkout.service');
const { reconcileTransaction, RECONCILE_OUTCOME } = require('@/lib/services/payment-reconcile.service');

const REFERENCE = 'TXN-1791597028334-gsgqoizoy';
const INTENT = {
  reference: REFERENCE,
  kind: 'session',
  consumedAt: null,
  metadata: {
    studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
    startTimestamp: '2026-10-12T15:00:00.000Z', endTimestamp: '2026-10-12T16:00:00.000Z',
    originalAmount: '45000', discountAmount: '0', tutorPayoutBase: '45000',
  },
};

function transaction(overrides = {}) {
  return { id: '15113-1791597300-12345', status: 'APPROVED', amount_in_cents: 4500000, reference: REFERENCE, metadata: {}, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  paymentIntentRepo.findByReference.mockResolvedValue(INTENT);
  wompiService.processSuccessfulPayment.mockResolvedValue({
    payment: { id: 'pay-1' }, session: { id: 'sess-1' }, message: 'Payment processed successfully',
  });
});

describe('reconcileTransaction', () => {
  it('replays an APPROVED transaction by id through the session fulfiller', async () => {
    wompiApi.fetchTransaction.mockResolvedValue(transaction());

    const result = await reconcileTransaction({ transactionId: '15113-1791597300-12345' });

    expect(wompiApi.fetchTransaction).toHaveBeenCalledWith('15113-1791597300-12345', { reference: null });
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledWith(expect.objectContaining({ id: '15113-1791597300-12345' }));
    expect(fulfilPaidRegistration).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: RECONCILE_OUTCOME.FULFILLED,
      reference: REFERENCE,
      status: 'APPROVED',
      amountInCents: 4500000,
      sessionId: 'sess-1',
      paymentId: 'pay-1',
    });
  });

  it('with only a reference, uses the transaction id confirm-payment pinned on the intent', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue({
      ...INTENT, metadata: { ...INTENT.metadata, pendingTransactionId: 'pinned-tx' },
    });
    wompiApi.fetchTransaction.mockResolvedValue(transaction({ id: 'pinned-tx' }));

    const result = await reconcileTransaction({ reference: REFERENCE });

    expect(wompiApi.fetchTransaction).toHaveBeenCalledWith('pinned-tx', { reference: REFERENCE });
    expect(result.outcome).toBe(RECONCILE_OUTCOME.FULFILLED);
  });

  it('refuses a reference whose intent has no pinned transaction', async () => {
    await expect(reconcileTransaction({ reference: REFERENCE })).rejects.toMatchObject({ code: 'NO_PENDING_TRANSACTION' });
    expect(wompiApi.fetchTransaction).not.toHaveBeenCalled();
  });

  it('refuses an unknown reference and an empty input', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue(null);
    await expect(reconcileTransaction({ reference: 'TXN-nope' })).rejects.toMatchObject({ code: 'INTENT_NOT_FOUND' });
    await expect(reconcileTransaction({})).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('reports a non-approved transaction without booking anything', async () => {
    wompiApi.fetchTransaction.mockResolvedValue(transaction({ status: 'DECLINED' }));

    const result = await reconcileTransaction({ transactionId: 'x' });

    expect(result).toMatchObject({ outcome: RECONCILE_OUTCOME.NOT_APPROVED, status: 'DECLINED' });
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('refuses an amount that does not match the frozen snapshot', async () => {
    wompiApi.fetchTransaction.mockResolvedValue(transaction({ amount_in_cents: 4000000 }));

    await expect(reconcileTransaction({ transactionId: 'x' })).rejects.toMatchObject({
      code: 'AMOUNT_MISMATCH', paidCents: 4000000, expectedCents: 4500000,
    });
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('is idempotent: an already-processed transaction answers ALREADY_PROCESSED', async () => {
    wompiApi.fetchTransaction.mockResolvedValue(transaction());
    wompiService.processSuccessfulPayment.mockResolvedValue({
      payment: { id: 'pay-1' }, session: null, message: 'Payment already processed',
    });

    const result = await reconcileTransaction({ transactionId: 'x' });

    expect(result).toMatchObject({ outcome: RECONCILE_OUTCOME.ALREADY_PROCESSED, paymentId: 'pay-1', sessionId: null });
  });

  it('dispatches event intents to the event fulfiller', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue({
      reference: 'EVT-1', kind: 'event',
      metadata: { kind: 'event', registrationId: 'r1', eventId: 'e1', studentId: 'u1', listPrice: '20000', discountAmount: '0', finalAmount: '20000' },
    });
    wompiApi.fetchTransaction.mockResolvedValue(transaction({ reference: 'EVT-1', amount_in_cents: 2000000 }));
    fulfilPaidRegistration.mockResolvedValue({ registration: { id: 'r1' }, payment: { id: 'ep-1' } });

    const result = await reconcileTransaction({ transactionId: 'x' });

    expect(fulfilPaidRegistration).toHaveBeenCalledTimes(1);
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: RECONCILE_OUTCOME.FULFILLED, registrationId: 'r1', paymentId: 'ep-1' });
  });

  it('maps Wompi lookup failures to TRANSACTION_NOT_FOUND / PROVIDER_UNAVAILABLE', async () => {
    wompiApi.fetchTransaction.mockRejectedValueOnce(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    await expect(reconcileTransaction({ transactionId: 'x' })).rejects.toMatchObject({ code: 'TRANSACTION_NOT_FOUND' });

    wompiApi.fetchTransaction.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE' }));
    await expect(reconcileTransaction({ transactionId: 'x' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true });
  });

  it('lets fulfilment business errors bubble with their code (paid but must not be honoured as-is)', async () => {
    wompiApi.fetchTransaction.mockResolvedValue(transaction());
    wompiService.processSuccessfulPayment.mockRejectedValue(Object.assign(new Error('slot taken'), { code: 'SESSION_CONFLICT' }));

    await expect(reconcileTransaction({ transactionId: 'x' })).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
  });
});
