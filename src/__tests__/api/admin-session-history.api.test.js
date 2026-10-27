/**
 * @jest-environment node
 *
 * Tests for GET /api/admin/metrics/session-history.
 *
 * The guard and the service are mocked so these cover only the route
 * concerns: admin gating, query-param parsing/defaults, the response
 * envelope and the 500 error path.
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({
  getSessionHistory: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const metricsService = require('@/lib/services/admin-metrics.service');
const { GET } = require('@/app/api/admin/metrics/session-history/route');

const URL_BASE = 'http://localhost/api/admin/metrics/session-history';
const req = (qs = '') => new Request(`${URL_BASE}${qs}`);

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

describe('GET /api/admin/metrics/session-history', () => {
  it('passes the guard response through when not an admin', async () => {
    const denied = NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    requireAdminUser.mockResolvedValue(denied);

    const res = await GET(req());

    expect(res).toBe(denied);
    expect(metricsService.getSessionHistory).not.toHaveBeenCalled();
  });

  it('parses status/limit/offset and spreads the page into the envelope', async () => {
    metricsService.getSessionHistory.mockResolvedValue({ items: [{ id: 's1' }], total: 30, limit: 10, offset: 20 });

    const res = await GET(req('?status=completed&limit=10&offset=20'));
    const json = await res.json();

    expect(metricsService.getSessionHistory).toHaveBeenCalledWith({ status: 'completed', limit: 10, offset: 20 });
    expect(json).toEqual({ success: true, items: [{ id: 's1' }], total: 30, limit: 10, offset: 20 });
  });

  it('defaults to status=all, limit=25, offset=0 when params are absent or invalid', async () => {
    metricsService.getSessionHistory.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });

    await GET(req('?limit=abc&offset=xyz'));

    expect(metricsService.getSessionHistory).toHaveBeenCalledWith({ status: 'all', limit: 25, offset: 0 });
  });

  it('returns 500 when the service throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    metricsService.getSessionHistory.mockRejectedValue(new Error('db down'));

    const res = await GET(req());

    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
    errSpy.mockRestore();
  });
});
