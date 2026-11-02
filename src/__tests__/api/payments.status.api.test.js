/**
 * @jest-environment node
 *
 * GET /api/payments/status?reference= — booking status of the caller's own
 * session checkout: an already booked session, else Wompi's transactions for
 * the reference (APPROVED → confirm-payment pipeline).
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/services/wompi-api.service', () => ({ fetchTransactionsByReference: jest.fn() }));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({ findByReference: jest.fn() }));
jest.mock('@/lib/repositories/session.repository', () => ({ findSessionByIntentReference: jest.fn() }));
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));
jest.mock('@/lib/services/event-checkout.service', () => ({ fulfilPaidRegistration: jest.fn() }));
jest.mock('@/lib/payments/pricing', () => ({ resolveSessionAmount: jest.fn() }));
const mockScope = { setTag: jest.fn(), setLevel: jest.fn(), setContext: jest.fn() };
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn((fn) => fn(mockScope)),
}));

const { NextResponse } = require('next/server');
const Sentry = require('@sentry/nextjs');
const { authenticateRequest } = require('@/lib/auth/middleware');
const wompiApi = require('@/lib/services/wompi-api.service');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const wompiService = require('@/lib/services/wompi.service');
const { GET } = require('@/app/api/payments/status/route');

function statusRequest(reference = 'TXN-1') {
  const qs = reference === null ? '' : `?reference=${encodeURIComponent(reference)}`;
  return new Request(`http://localhost/api/payments/status${qs}`, {
    headers: { authorization: 'Bearer test-token' },
  });
}

const INTENT = {
  reference: 'TXN-1',
  kind: 'session',
  metadata: {
    studentId: 'student-1', tutorId: 'tutor-1', courseId: 'course-1',
    startTimestamp: '2026-11-10T15:00:00.000Z', endTimestamp: '2026-11-10T16:00:00.000Z',
    originalAmount: '50000', discountAmount: '0', tutorPayoutBase: '50000',
  },
};
const SESSION = { id: 'sess-1', googleMeetLink: 'https://meet.google.com/abc', participants: [{ studentId: 'student-1' }] };

function tx(status, overrides = {}) {
  return { id: `wompi-${status}`, reference: 'TXN-1', status, amount_in_cents: 5000000, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticateRequest.mockResolvedValue({ sub: 'student-1' });
  paymentIntentRepo.findByReference.mockResolvedValue(INTENT);
  sessionRepo.findSessionByIntentReference.mockResolvedValue(null);
  wompiApi.fetchTransactionsByReference.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('auth and ownership', () => {
  it('401 without a valid session', async () => {
    authenticateRequest.mockResolvedValue(NextResponse.json({ error: 'nope' }, { status: 401 }));
    const res = await GET(statusRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: 'UNAUTHORIZED' });
    expect(paymentIntentRepo.findByReference).not.toHaveBeenCalled();
  });

  it('400 without a reference', async () => {
    const res = await GET(statusRequest(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'MISSING_REFERENCE' });
  });

  it('404 for an unknown reference', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue(null);
    const res = await GET(statusRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'NOT_FOUND' });
  });

  it("403 for another student's intent (identity from the JWT)", async () => {
    authenticateRequest.mockResolvedValue({ sub: 'someone-else' });
    const res = await GET(statusRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, error: 'FORBIDDEN' });
    expect(sessionRepo.findSessionByIntentReference).not.toHaveBeenCalled();
    expect(wompiApi.fetchTransactionsByReference).not.toHaveBeenCalled();
  });

  it('400 for an event intent', async () => {
    paymentIntentRepo.findByReference.mockResolvedValue({
      reference: 'EVT-1', kind: 'event', metadata: { kind: 'event', studentId: 'student-1' },
    });
    const res = await GET(statusRequest('EVT-1'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'UNSUPPORTED_INTENT_KIND' });
  });
});

describe('states', () => {
  it('confirmed with the session when the intent already booked one (no Wompi call)', async () => {
    sessionRepo.findSessionByIntentReference.mockResolvedValue(SESSION);
    const res = await GET(statusRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, state: 'confirmed', session: SESSION });
    expect(sessionRepo.findSessionByIntentReference).toHaveBeenCalledWith('TXN-1');
    expect(wompiApi.fetchTransactionsByReference).not.toHaveBeenCalled();
  });

  it('APPROVED at Wompi → runs the confirmation pipeline → confirmed with the session', async () => {
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('DECLINED'), tx('APPROVED')]);
    wompiService.processSuccessfulPayment.mockResolvedValue({ payment: { id: 'p1' }, session: SESSION });

    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'confirmed', session: SESSION });
    expect(wompiApi.fetchTransactionsByReference).toHaveBeenCalledWith('TXN-1');
    expect(wompiService.processSuccessfulPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 'wompi-APPROVED' }));
  });

  it('APPROVED with an amount that contradicts the intent is not booked → pending', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('APPROVED', { amount_in_cents: 100 })]);

    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('APPROVED but the concurrent confirmation still holds the slot → pending, no Sentry', async () => {
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('APPROVED')]);
    wompiService.processSuccessfulPayment.mockRejectedValue(Object.assign(new Error('c'), { code: 'P2034' }));

    const res = await GET(statusRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('APPROVED but fulfilment fails unexpectedly → pending + Sentry, never 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('APPROVED')]);
    const boom = new Error('db down');
    wompiService.processSuccessfulPayment.mockRejectedValue(boom);

    const res = await GET(statusRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
  });

  it('all DECLINED / ERROR / VOIDED → failed', async () => {
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('DECLINED'), tx('ERROR'), tx('VOIDED')]);
    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'failed' });
  });

  it('PENDING at Wompi → pending', async () => {
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('DECLINED'), tx('PENDING')]);
    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
  });

  it('no transaction yet → pending', async () => {
    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
  });

  it('ignores transactions of another reference', async () => {
    wompiApi.fetchTransactionsByReference.mockResolvedValue([tx('APPROVED', { reference: 'TXN-12' })]);
    const res = await GET(statusRequest());
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
    expect(wompiService.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('a Wompi lookup failure → pending + Sentry warning, never 500', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('[wompi-api] Request timed out');
    wompiApi.fetchTransactionsByReference.mockRejectedValue(err);

    const res = await GET(statusRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, state: 'pending' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    expect(mockScope.setLevel).toHaveBeenCalledWith('warning');
  });
});
