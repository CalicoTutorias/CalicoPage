/**
 * @jest-environment node
 *
 * GET /api/cron/complete-sessions only runs for Vercel Cron, which sends
 * `Authorization: Bearer <CRON_SECRET>`.
 */

jest.mock('@/lib/services/session-auto-complete.service', () => ({ autoCompleteEndedSessions: jest.fn() }));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

const service = require('@/lib/services/session-auto-complete.service');
const { invalidateAllMetrics } = require('@/lib/services/admin-metrics.service');
const { GET } = require('@/app/api/cron/complete-sessions/route');

const request = (authorization) => new Request('http://localhost/api/cron/complete-sessions', {
  headers: authorization ? { authorization } : {},
});

const ORIGINAL = process.env.CRON_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.CRON_SECRET = 'cron-secret';
  service.autoCompleteEndedSessions.mockResolvedValue({ found: 1, completed: 1, skipped: 0, failed: 0 });
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
  jest.restoreAllMocks();
});

it('runs the job for Vercel Cron and refreshes the metrics', async () => {
  const res = await GET(request('Bearer cron-secret'));

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ success: true, found: 1, completed: 1, skipped: 0, failed: 0 });
  expect(invalidateAllMetrics).toHaveBeenCalled();
});

it.each([undefined, 'Bearer wrong', 'cron-secret'])('refuses %s', async (authorization) => {
  const res = await GET(request(authorization));

  expect(res.status).toBe(401);
  expect(service.autoCompleteEndedSessions).not.toHaveBeenCalled();
});

it('fails closed when CRON_SECRET is not configured', async () => {
  delete process.env.CRON_SECRET;

  const res = await GET(request('Bearer undefined'));

  expect(res.status).toBe(500);
  expect(service.autoCompleteEndedSessions).not.toHaveBeenCalled();
});
