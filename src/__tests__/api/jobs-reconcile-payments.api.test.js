/**
 * @jest-environment node
 *
 * POST /api/jobs/reconcile-payments — the scheduler's entry point to the
 * payment sweeper. Real `requireAdminSecret` guard; the service is mocked.
 */

jest.mock('@/lib/services/payment-sweeper.service', () => ({ sweepUnconsumedIntents: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn((fn) => fn({ setTag: jest.fn(), setLevel: jest.fn() })),
}));

const Sentry = require('@sentry/nextjs');
const { sweepUnconsumedIntents } = require('@/lib/services/payment-sweeper.service');
const route = require('@/app/api/jobs/reconcile-payments/route');

const ORIGINAL_ENV = process.env;
const SECRET = 'sweeper-secret';

const SUMMARY = {
  checked: 2,
  deferred: 0,
  counts: { FULFILLED: 1, ALREADY_PROCESSED: 0, NOT_APPROVED: 0, NO_TRANSACTION: 1, NEEDS_ATTENTION: 0, ERROR: 0 },
  items: [{ reference: 'TXN-1', kind: 'session', outcome: 'FULFILLED', reason: null }],
};

function req(headers = {}) {
  return new Request('http://localhost/api/jobs/reconcile-payments', { method: 'POST', headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, ADMIN_SECRET: SECRET };
  sweepUnconsumedIntents.mockResolvedValue(SUMMARY);
});
afterAll(() => { process.env = ORIGINAL_ENV; });

it('declares a dynamic route with a maxDuration Vercel Hobby accepts', () => {
  expect(route.dynamic).toBe('force-dynamic');
  expect(route.maxDuration).toBeLessThanOrEqual(60);
});

it('refuses a call without x-admin-secret before running the sweep', async () => {
  const res = await route.POST(req());
  expect(res.status).toBe(401);
  expect(sweepUnconsumedIntents).not.toHaveBeenCalled();
});

it('refuses a wrong x-admin-secret', async () => {
  const res = await route.POST(req({ 'x-admin-secret': 'nope' }));
  expect(res.status).toBe(401);
  expect(sweepUnconsumedIntents).not.toHaveBeenCalled();
});

it('refuses everything when ADMIN_SECRET is not configured (fails closed)', async () => {
  delete process.env.ADMIN_SECRET;
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await route.POST(req({ 'x-admin-secret': 'undefined' }));
  expect(res.status).toBe(500);
  expect(sweepUnconsumedIntents).not.toHaveBeenCalled();
  console.error.mockRestore();
});

it('runs the sweep with the right secret and answers its summary', async () => {
  const res = await route.POST(req({ 'x-admin-secret': SECRET }));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, ...SUMMARY });
  expect(sweepUnconsumedIntents).toHaveBeenCalledTimes(1);
});

it('answers 500 and reports to Sentry when the sweep itself fails (e.g. the database is down)', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  sweepUnconsumedIntents.mockRejectedValue(new Error('db down'));

  const res = await route.POST(req({ 'x-admin-secret': SECRET }));

  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ success: false, error: 'Internal server error' });
  expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  console.error.mockRestore();
});
