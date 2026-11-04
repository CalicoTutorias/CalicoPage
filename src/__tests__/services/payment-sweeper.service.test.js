/**
 * @jest-environment node
 *
 * payment-sweeper.service — the scheduled safety net that asks Wompi about
 * unconsumed payment intents and books approved charges no confirmation path
 * booked. Wompi, reconcile and the repositories are mocked; the selection
 * query itself is covered on real Postgres (payment-sweeper.int.test.js).
 */

jest.mock('@/lib/services/wompi-api.service', () => ({ findTransactionsByReference: jest.fn() }));
jest.mock('@/lib/services/payment-reconcile.service', () => ({ reconcileTransaction: jest.fn() }));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  findUnconsumedForSweep: jest.fn(),
  recordSweepResult: jest.fn(),
}));
jest.mock('@/lib/repositories/session.repository', () => ({ findActiveSessionCreatedAfter: jest.fn() }));
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));
jest.mock('@/lib/services/event-checkout.service', () => ({ fulfilPaidRegistration: jest.fn() }));
jest.mock('@/lib/payments/pricing', () => ({ resolveSessionAmount: jest.fn() }));

const mockScope = {
  setTag: jest.fn(), setLevel: jest.fn(), setFingerprint: jest.fn(), setContext: jest.fn(),
};
jest.mock('@sentry/nextjs', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((fn) => fn(mockScope)),
}));

const Sentry = require('@sentry/nextjs');
const wompiApi = require('@/lib/services/wompi-api.service');
const { reconcileTransaction } = require('@/lib/services/payment-reconcile.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const { sweepUnconsumedIntents } = require('@/lib/services/payment-sweeper.service');

const MIN = 60_000;
const NOW = new Date('2026-11-04T15:00:00.000Z');
const CREATED_AT = new Date(NOW.getTime() - 3 * 60 * MIN);

function sessionIntent(overrides = {}, metadata = {}) {
  return {
    reference: 'TXN-1',
    kind: 'session',
    createdAt: CREATED_AT,
    metadata: {
      studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
      startTimestamp: '2026-11-06T15:00:00.000Z', endTimestamp: '2026-11-06T16:00:00.000Z',
      originalAmount: '45000', discountAmount: '0', tutorPayoutBase: '45000',
      ...metadata,
    },
    ...overrides,
  };
}

function eventIntent(overrides = {}) {
  return {
    reference: 'EVT-1',
    kind: 'event',
    createdAt: CREATED_AT,
    metadata: { kind: 'event', registrationId: 'r1', eventId: 'e1', studentId: 'u1', finalAmount: '20000' },
    ...overrides,
  };
}

function tx(id, status, overrides = {}) {
  return { id, status, amount_in_cents: 4500000, reference: 'TXN-1', created_at: '2026-11-04T12:05:00.000Z', ...overrides };
}

const tagsSet = () => Object.fromEntries(mockScope.setTag.mock.calls);
const recorded = (i = 0) => paymentIntentRepo.recordSweepResult.mock.calls[i];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([sessionIntent()]);
  paymentIntentRepo.recordSweepResult.mockResolvedValue(undefined);
  sessionRepo.findActiveSessionCreatedAfter.mockResolvedValue(null);
  wompiApi.findTransactionsByReference.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('selection', () => {
  it('asks for unconsumed intents created between 48 h and 10 min ago, skipping final statuses and human-owned results, capped at 40', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([]);

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(paymentIntentRepo.findUnconsumedForSweep).toHaveBeenCalledWith({
      createdFrom: new Date('2026-11-02T15:00:00.000Z'),
      createdTo: new Date('2026-11-04T14:50:00.000Z'),
      skipStatuses: ['DECLINED', 'VOIDED', 'ERROR'],
      skipOutcomes: ['NEEDS_ATTENTION'],
      limit: 40,
    });
    expect(summary).toEqual({
      checked: 0,
      deferred: 0,
      counts: { FULFILLED: 0, ALREADY_PROCESSED: 0, NOT_APPROVED: 0, NO_TRANSACTION: 0, NEEDS_ATTENTION: 0, ERROR: 0 },
      items: [],
    });
  });

  it('passes a custom cap through', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([]);
    await sweepUnconsumedIntents({ now: NOW, limit: 5 });
    expect(paymentIntentRepo.findUnconsumedForSweep).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  it('searches Wompi by reference from the intent creation time', async () => {
    await sweepUnconsumedIntents({ now: NOW });
    expect(wompiApi.findTransactionsByReference).toHaveBeenCalledWith('TXN-1', { since: CREATED_AT });
  });

  it('leaves the rest for the next run once the time budget is spent', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([sessionIntent(), sessionIntent({ reference: 'TXN-2' })]);

    const summary = await sweepUnconsumedIntents({ now: NOW, budgetMs: 0 });

    expect(summary).toMatchObject({ checked: 0, deferred: 2 });
    expect(wompiApi.findTransactionsByReference).not.toHaveBeenCalled();
  });
});

describe('approved transaction', () => {
  it('books it through reconcile, records FULFILLED and raises the sweeper_rescued alert', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([
      tx('tx-declined', 'DECLINED', { created_at: '2026-11-04T12:10:00.000Z' }),
      tx('tx-ok', 'APPROVED', { created_at: '2026-11-04T12:06:00.000Z' }),
    ]);
    reconcileTransaction.mockResolvedValue({ outcome: 'FULFILLED', status: 'APPROVED', transactionId: 'tx-ok', sessionId: 's1' });

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(reconcileTransaction).toHaveBeenCalledWith({ transactionId: 'tx-ok', reference: 'TXN-1' });
    expect(recorded()).toEqual(['TXN-1', {
      status: 'APPROVED', transactionId: 'tx-ok', outcome: 'FULFILLED', reason: null, checkedAt: NOW.toISOString(),
    }]);
    expect(summary.counts.FULFILLED).toBe(1);
    expect(summary.items).toEqual([{ reference: 'TXN-1', kind: 'session', outcome: 'FULFILLED', reason: null }]);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(mockScope.setLevel).toHaveBeenCalledWith('error');
    expect(tagsSet()).toMatchObject({ service: 'wompi', issue_type: 'sweeper_rescued' });
    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['payments', 'payment-sweeper', 'sweeper_rescued', 'TXN-1']);
    expect(mockScope.setContext).toHaveBeenCalledWith('payment_sweep', expect.objectContaining({
      reference: 'TXN-1', transactionId: 'tx-ok', kind: 'session', amountInCents: 4500000,
    }));
  });

  it('records ALREADY_PROCESSED without alerting or listing it', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-ok', 'APPROVED')]);
    reconcileTransaction.mockResolvedValue({ outcome: 'ALREADY_PROCESSED', status: 'APPROVED', transactionId: 'tx-ok' });

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded()[1]).toMatchObject({ status: 'APPROVED', outcome: 'ALREADY_PROCESSED', reason: null });
    expect(summary.counts.ALREADY_PROCESSED).toBe(1);
    expect(summary.items).toEqual([]);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('event intents skip the session guards and go straight to reconcile', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([eventIntent()]);
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-evt', 'APPROVED', { reference: 'EVT-1' })]);
    reconcileTransaction.mockResolvedValue({ outcome: 'FULFILLED', status: 'APPROVED', transactionId: 'tx-evt' });

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(sessionRepo.findActiveSessionCreatedAfter).not.toHaveBeenCalled();
    expect(reconcileTransaction).toHaveBeenCalledWith({ transactionId: 'tx-evt', reference: 'EVT-1' });
    expect(summary.items).toEqual([{ reference: 'EVT-1', kind: 'event', outcome: 'FULFILLED', reason: null }]);
  });
});

describe('guards: approved, but booking would be wrong', () => {
  beforeEach(() => {
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-ok', 'APPROVED')]);
  });

  it('SLOT_PASSED: the session start is already behind us → NEEDS_ATTENTION, nothing booked, fatal alert', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([
      sessionIntent({}, { startTimestamp: '2026-11-04T14:00:00.000Z', endTimestamp: '2026-11-04T15:00:00.000Z' }),
    ]);

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(reconcileTransaction).not.toHaveBeenCalled();
    expect(recorded()[1]).toEqual({
      status: 'APPROVED', transactionId: 'tx-ok', outcome: 'NEEDS_ATTENTION', reason: 'SLOT_PASSED', checkedAt: NOW.toISOString(),
    });
    expect(summary.items).toEqual([{ reference: 'TXN-1', kind: 'session', outcome: 'NEEDS_ATTENTION', reason: 'SLOT_PASSED' }]);
    expect(mockScope.setLevel).toHaveBeenCalledWith('fatal');
    expect(tagsSet()).toMatchObject({ service: 'wompi', issue_type: 'paid_not_booked', reason: 'SLOT_PASSED' });
    expect(mockScope.setFingerprint).toHaveBeenCalledWith(['payments', 'payment-sweeper', 'paid_not_booked', 'TXN-1']);
  });

  it('a slot starting later today is still booked', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([
      sessionIntent({}, { startTimestamp: '2026-11-04T15:10:00.000Z', endTimestamp: '2026-11-04T16:10:00.000Z' }),
    ]);
    reconcileTransaction.mockResolvedValue({ outcome: 'FULFILLED', status: 'APPROVED', transactionId: 'tx-ok' });

    await sweepUnconsumedIntents({ now: NOW });

    expect(reconcileTransaction).toHaveBeenCalledTimes(1);
  });

  it('POSSIBLE_MANUAL_DUPLICATE: the student already has a live session with this tutor and course created after the intent', async () => {
    sessionRepo.findActiveSessionCreatedAfter.mockResolvedValue({ id: 'manual-1', source: 'ManualAdmin' });

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(sessionRepo.findActiveSessionCreatedAfter).toHaveBeenCalledWith({
      studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
      createdAfter: CREATED_AT, excludeIntentReference: 'TXN-1',
    });
    expect(reconcileTransaction).not.toHaveBeenCalled();
    expect(recorded()[1]).toMatchObject({ outcome: 'NEEDS_ATTENTION', reason: 'POSSIBLE_MANUAL_DUPLICATE' });
    expect(summary.counts.NEEDS_ATTENTION).toBe(1);
    expect(tagsSet()).toMatchObject({ issue_type: 'paid_not_booked', reason: 'POSSIBLE_MANUAL_DUPLICATE' });
  });

  it('a business refusal from reconcile is NEEDS_ATTENTION with its code as the reason', async () => {
    reconcileTransaction.mockRejectedValue(Object.assign(new Error('slot taken'), { code: 'SESSION_CONFLICT' }));

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded()[1]).toMatchObject({ status: 'APPROVED', transactionId: 'tx-ok', outcome: 'NEEDS_ATTENTION', reason: 'SESSION_CONFLICT' });
    expect(summary.items).toEqual([{ reference: 'TXN-1', kind: 'session', outcome: 'NEEDS_ATTENTION', reason: 'SESSION_CONFLICT' }]);
    expect(mockScope.setLevel).toHaveBeenCalledWith('fatal');
  });

  it.each(['AMOUNT_MISMATCH', 'INTENT_CONSUMED', 'COUPON_LIMIT_EXCEEDED', 'EVENT_REGISTRATION_MISSING'])(
    '%s is NEEDS_ATTENTION too',
    async (code) => {
      reconcileTransaction.mockRejectedValue(Object.assign(new Error(code), { code }));
      const summary = await sweepUnconsumedIntents({ now: NOW });
      expect(summary.items[0]).toMatchObject({ outcome: 'NEEDS_ATTENTION', reason: code });
    },
  );
});

describe('not approved', () => {
  it('PENDING / DECLINED: records the most recent transaction as NOT_APPROVED, books nothing, no alert', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([
      tx('tx-old', 'DECLINED', { created_at: '2026-11-04T12:05:00.000Z' }),
      tx('tx-new', 'PENDING', { created_at: '2026-11-04T12:20:00.000Z' }),
    ]);

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded()[1]).toEqual({
      status: 'PENDING', transactionId: 'tx-new', outcome: 'NOT_APPROVED', reason: null, checkedAt: NOW.toISOString(),
    });
    expect(summary.counts.NOT_APPROVED).toBe(1);
    expect(summary.items).toEqual([]);
    expect(reconcileTransaction).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('a lone DECLINED transaction is recorded with its final status', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-d', 'DECLINED')]);
    await sweepUnconsumedIntents({ now: NOW });
    expect(recorded()[1]).toMatchObject({ status: 'DECLINED', transactionId: 'tx-d', outcome: 'NOT_APPROVED' });
  });

  it('no transaction at all (abandoned checkout): NO_TRANSACTION, nothing else', async () => {
    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded()[1]).toEqual({
      status: 'NO_TRANSACTION', transactionId: null, outcome: 'NO_TRANSACTION', reason: null, checkedAt: NOW.toISOString(),
    });
    expect(summary.counts.NO_TRANSACTION).toBe(1);
    expect(summary.items).toEqual([]);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it('Wompi unreachable on one intent → ERROR (status unknown), warning, and the run goes on with the next intent', async () => {
    paymentIntentRepo.findUnconsumedForSweep.mockResolvedValue([sessionIntent(), sessionIntent({ reference: 'TXN-2' })]);
    wompiApi.findTransactionsByReference
      .mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE', retryable: true }))
      .mockResolvedValueOnce([tx('tx-2', 'APPROVED', { reference: 'TXN-2' })]);
    reconcileTransaction.mockResolvedValue({ outcome: 'FULFILLED', status: 'APPROVED', transactionId: 'tx-2' });

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded(0)).toEqual(['TXN-1', {
      status: null, transactionId: null, outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE', checkedAt: NOW.toISOString(),
    }]);
    expect(recorded(1)).toEqual(['TXN-2', expect.objectContaining({ outcome: 'FULFILLED' })]);
    expect(summary).toMatchObject({
      checked: 2,
      counts: expect.objectContaining({ ERROR: 1, FULFILLED: 1 }),
      items: [
        { reference: 'TXN-1', kind: 'session', outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE' },
        { reference: 'TXN-2', kind: 'session', outcome: 'FULFILLED', reason: null },
      ],
    });
    expect(mockScope.setLevel.mock.calls.map((c) => c[0])).toEqual(['warning', 'error']);
  });

  it('a transient failure inside reconcile is ERROR, not NEEDS_ATTENTION', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-ok', 'APPROVED')]);
    reconcileTransaction.mockRejectedValue(Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE', retryable: true }));

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(recorded()[1]).toMatchObject({ status: 'APPROVED', transactionId: 'tx-ok', outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE' });
    expect(summary.counts.ERROR).toBe(1);
    expect(mockScope.setLevel).toHaveBeenCalledWith('warning');
    expect(tagsSet()).toMatchObject({ issue_type: 'sweeper_error' });
  });

  it('an unexpected exception (no code) is ERROR with its message as the reason', async () => {
    wompiApi.findTransactionsByReference.mockResolvedValue([tx('tx-ok', 'APPROVED')]);
    sessionRepo.findActiveSessionCreatedAfter.mockRejectedValue(new Error('connection reset'));

    const summary = await sweepUnconsumedIntents({ now: NOW });

    expect(summary.items).toEqual([{ reference: 'TXN-1', kind: 'session', outcome: 'ERROR', reason: 'connection reset' }]);
    expect(reconcileTransaction).not.toHaveBeenCalled();
  });
});
