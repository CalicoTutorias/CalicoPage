/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/services/admin-metrics.service.js`.
 *
 * Focus on the parts that carry logic on top of the repository: the overview
 * KPI shaping (commission/Wompi split via the real fees.js), the per-month
 * revenue net calculation, the input clamping for every series endpoint, and
 * the in-memory cache + invalidation.
 */

jest.mock('@/lib/repositories/admin-metrics.repository', () => ({
  sessionsThisWeek: jest.fn(),
  paidPaymentsThisMonth: jest.fn(),
  activeTutorsCount: jest.fn(),
  pendingApplicationsCount: jest.fn(),
  sessionsByWeek: jest.fn(),
  revenueByMonth: jest.fn(),
  topCourses: jest.fn(),
  topTutors: jest.fn(),
}));

const repo = require('@/lib/repositories/admin-metrics.repository');
const service = require('@/lib/services/admin-metrics.service');

beforeEach(() => {
  jest.clearAllMocks();
  service.invalidateAllMetrics(); // module-level cache — reset between tests
});

// ─── getOverview ─────────────────────────────────────────────────────────

describe('getOverview', () => {
  it('splits the paid volume into Calico net / tutor payout / Wompi fee', async () => {
    repo.sessionsThisWeek.mockResolvedValue(7);
    repo.paidPaymentsThisMonth.mockResolvedValue([100000, 100000]);
    repo.activeTutorsCount.mockResolvedValue(12);
    repo.pendingApplicationsCount.mockResolvedValue(3);

    const out = await service.getOverview();

    expect(out.sessionsThisWeek).toBe(7);
    expect(out.grossVolumeThisMonth).toBe(200000);
    expect(out.revenueThisMonth).toBeCloseTo(22027, 2);   // Calico net (2 × 11013.5)
    expect(out.tutorPayoutThisMonth).toBeCloseTo(170000, 2);
    expect(out.wompiFeeThisMonth).toBeCloseTo(7973, 2);   // gross − net − payout
    expect(out.activeTutorsLast30Days).toBe(12);
    expect(out.pendingApplications).toBe(3);
  });

  it('asks for active tutors over a 30-day window', async () => {
    repo.sessionsThisWeek.mockResolvedValue(0);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    repo.activeTutorsCount.mockResolvedValue(0);
    repo.pendingApplicationsCount.mockResolvedValue(0);

    await service.getOverview();
    expect(repo.activeTutorsCount).toHaveBeenCalledWith({ days: 30 });
  });

  it('caches the overview (repos hit once across two calls)', async () => {
    repo.sessionsThisWeek.mockResolvedValue(1);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    repo.activeTutorsCount.mockResolvedValue(1);
    repo.pendingApplicationsCount.mockResolvedValue(1);

    await service.getOverview();
    await service.getOverview();

    expect(repo.sessionsThisWeek).toHaveBeenCalledTimes(1);
  });

  it('invalidateAllMetrics clears the cache', async () => {
    repo.sessionsThisWeek.mockResolvedValue(1);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    repo.activeTutorsCount.mockResolvedValue(1);
    repo.pendingApplicationsCount.mockResolvedValue(1);

    await service.getOverview();
    service.invalidateAllMetrics();
    await service.getOverview();

    expect(repo.sessionsThisWeek).toHaveBeenCalledTimes(2);
  });
});

// ─── getRevenueSeries ────────────────────────────────────────────────────

describe('getRevenueSeries', () => {
  it('adds the exact Calico net and tutor payout to each month', async () => {
    repo.revenueByMonth.mockResolvedValue([
      { month: '2026-01', gross: 100000, paymentsCount: 1 },
    ]);

    const [row] = await service.getRevenueSeries({ months: 12 });

    expect(row.month).toBe('2026-01');     // original fields preserved
    expect(row.gross).toBe(100000);
    expect(row.calicoNet).toBeCloseTo(11013.5, 2);
    expect(row.tutorPayout).toBeCloseTo(85000, 2);
  });

  it('clamps months into the 1..36 range', async () => {
    repo.revenueByMonth.mockResolvedValue([]);

    await service.getRevenueSeries({ months: 999 });
    expect(repo.revenueByMonth).toHaveBeenCalledWith({ months: 36 });

    service.invalidateAllMetrics();
    await service.getRevenueSeries({ months: 0 });
    expect(repo.revenueByMonth).toHaveBeenLastCalledWith({ months: 1 });
  });
});

// ─── series clamping (sessions / top courses / top tutors) ───────────────

describe('input clamping for series endpoints', () => {
  it('getSessionsSeries clamps weeks to 1..52', async () => {
    repo.sessionsByWeek.mockResolvedValue([]);

    await service.getSessionsSeries({ weeks: 100 });
    expect(repo.sessionsByWeek).toHaveBeenCalledWith({ weeks: 52 });

    service.invalidateAllMetrics();
    await service.getSessionsSeries({ weeks: 0 });
    expect(repo.sessionsByWeek).toHaveBeenLastCalledWith({ weeks: 1 });
  });

  it('getTopCourses clamps days to 1..365 and limit to 1..50', async () => {
    repo.topCourses.mockResolvedValue([]);
    await service.getTopCourses({ days: 999, limit: 999 });
    expect(repo.topCourses).toHaveBeenCalledWith({ days: 365, limit: 50 });
  });

  it('getTopTutors clamps days to 1..365 and limit to 1..50', async () => {
    repo.topTutors.mockResolvedValue([]);
    await service.getTopTutors({ days: 0, limit: 0 });
    expect(repo.topTutors).toHaveBeenCalledWith({ days: 1, limit: 1 });
  });

  it('uses default windows when called with no arguments', async () => {
    repo.topTutors.mockResolvedValue([]);
    await service.getTopTutors();
    expect(repo.topTutors).toHaveBeenCalledWith({ days: 30, limit: 10 });
  });
});
