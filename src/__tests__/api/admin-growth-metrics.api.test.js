/**
 * @jest-environment node
 *
 * Tests for the admin growth-metrics endpoints:
 *   GET /api/admin/metrics/profitability
 *   GET /api/admin/metrics/retention
 *   GET /api/admin/metrics/retention/cohorts
 *
 * The guard (requireAdminUser) and the service are mocked so these tests
 * cover only the route concerns: admin gating, query-param parsing/defaults,
 * the response envelope, and the 500 error path.
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/admin-growth.service', () => ({
  getCourseProfitability: jest.fn(),
  getRetentionOverview: jest.fn(),
  getRetentionCohorts: jest.fn(),
  getActiveUsers: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const growthService = require('@/lib/services/admin-growth.service');

const { GET: getProfitability } = require('@/app/api/admin/metrics/profitability/route');
const { GET: getRetention } = require('@/app/api/admin/metrics/retention/route');
const { GET: getCohorts } = require('@/app/api/admin/metrics/retention/cohorts/route');

const ADMIN = { sub: 'admin-1', role: 'ADMIN' };

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue(ADMIN); // authorised by default
  // The retention route fetches active-user counts alongside repeat KPIs.
  growthService.getActiveUsers.mockResolvedValue({
    activeTutors: 5,
    activeStudents: 10,
    windowDays: 7,
  });
});

const req = (url) => new Request(url);

// ─── profitability ───────────────────────────────────────────────────────

describe('GET /api/admin/metrics/profitability', () => {
  it('returns 401 (passing through the guard response) when not an admin', async () => {
    const denied = NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    requireAdminUser.mockResolvedValue(denied);

    const res = await getProfitability(req('http://localhost/api/admin/metrics/profitability'));

    expect(res).toBe(denied);
    expect(growthService.getCourseProfitability).not.toHaveBeenCalled();
  });

  it('parses days and returns the items envelope', async () => {
    growthService.getCourseProfitability.mockResolvedValue([{ id: 'c1', unprofitable: false }]);

    const res = await getProfitability(
      req('http://localhost/api/admin/metrics/profitability?days=30'),
    );
    const json = await res.json();

    expect(growthService.getCourseProfitability).toHaveBeenCalledWith({
      days: 30,
    });
    expect(json).toEqual({ success: true, items: [{ id: 'c1', unprofitable: false }] });
  });

  it('defaults to days=90 when params are absent or invalid', async () => {
    growthService.getCourseProfitability.mockResolvedValue([]);

    await getProfitability(req('http://localhost/api/admin/metrics/profitability?days=abc'));
    expect(growthService.getCourseProfitability).toHaveBeenCalledWith({
      days: 90,
    });
  });

  it('returns 500 when the service throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    growthService.getCourseProfitability.mockRejectedValue(new Error('db down'));

    const res = await getProfitability(req('http://localhost/api/admin/metrics/profitability'));

    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
    errSpy.mockRestore();
  });
});

// ─── retention ─────────────────────────────────────────────────────────────

describe('GET /api/admin/metrics/retention', () => {
  it('returns 401 short-circuit when not an admin', async () => {
    const denied = NextResponse.json({ error: 'nope' }, { status: 401 });
    requireAdminUser.mockResolvedValue(denied);

    const res = await getRetention(req('http://localhost/api/admin/metrics/retention'));
    expect(res).toBe(denied);
    expect(growthService.getRetentionOverview).not.toHaveBeenCalled();
  });

  it('spreads the overview data AND active-user counts alongside success:true', async () => {
    growthService.getRetentionOverview.mockResolvedValue({ repeatRate: 0.4, students: 100 });

    const res = await getRetention(
      req('http://localhost/api/admin/metrics/retention?days=60&careerId=career-1'),
    );
    const json = await res.json();

    expect(growthService.getRetentionOverview).toHaveBeenCalledWith({
      days: 60,
      careerId: 'career-1',
    });
    // Active-user counts use a fixed 7-day window, independent of the filter.
    expect(growthService.getActiveUsers).toHaveBeenCalledWith({ days: 7 });
    expect(json).toEqual({
      success: true,
      repeatRate: 0.4,
      students: 100,
      activeTutors: 5,
      activeStudents: 10,
      windowDays: 7,
    });
  });

  it('defaults days to 90 when absent', async () => {
    growthService.getRetentionOverview.mockResolvedValue({});
    await getRetention(req('http://localhost/api/admin/metrics/retention'));
    expect(growthService.getRetentionOverview).toHaveBeenCalledWith({ days: 90, careerId: null });
  });

  it('returns 500 when the service throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    growthService.getRetentionOverview.mockRejectedValue(new Error('boom'));

    const res = await getRetention(req('http://localhost/api/admin/metrics/retention'));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});

// ─── retention/cohorts ───────────────────────────────────────────────────

describe('GET /api/admin/metrics/retention/cohorts', () => {
  it('parses months + careerId and returns the cohorts envelope', async () => {
    growthService.getRetentionCohorts.mockResolvedValue([{ cohortMonth: '2026-01', rate30: 0.2 }]);

    const res = await getCohorts(
      req('http://localhost/api/admin/metrics/retention/cohorts?months=6&careerId=career-7'),
    );
    const json = await res.json();

    expect(growthService.getRetentionCohorts).toHaveBeenCalledWith({
      months: 6,
      careerId: 'career-7',
    });
    expect(json).toEqual({ success: true, cohorts: [{ cohortMonth: '2026-01', rate30: 0.2 }] });
  });

  it('defaults months to 12 when absent', async () => {
    growthService.getRetentionCohorts.mockResolvedValue([]);
    await getCohorts(req('http://localhost/api/admin/metrics/retention/cohorts'));
    expect(growthService.getRetentionCohorts).toHaveBeenCalledWith({ months: 12, careerId: null });
  });

  it('returns 500 when the service throws', async () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    growthService.getRetentionCohorts.mockRejectedValue(new Error('boom'));

    const res = await getCohorts(req('http://localhost/api/admin/metrics/retention/cohorts'));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
