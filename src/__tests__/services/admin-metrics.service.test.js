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
  sessionHistory: jest.fn(),
}));

// "Active tutors" now comes from the growth service (single source of truth
// shared with the Crecimiento page), not from the metrics repository.
jest.mock('@/lib/services/admin-growth.service', () => ({
  getActiveUsers: jest.fn(),
}));

const repo = require('@/lib/repositories/admin-metrics.repository');
const growthService = require('@/lib/services/admin-growth.service');
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
    growthService.getActiveUsers.mockResolvedValue({ activeTutors: 12, activeStudents: 40, windowDays: 7 });
    repo.pendingApplicationsCount.mockResolvedValue(3);

    const out = await service.getOverview();

    expect(out.sessionsThisWeek).toBe(7);
    expect(out.grossVolumeThisMonth).toBe(200000);
    expect(out.revenueThisMonth).toBeCloseTo(22027, 2);   // Calico net (2 × 11013.5)
    expect(out.tutorPayoutThisMonth).toBeCloseTo(170000, 2);
    expect(out.wompiFeeThisMonth).toBeCloseTo(7973, 2);   // gross − net − payout
    expect(out.activeTutors).toBe(12);
    expect(out.activeTutorsWindowDays).toBe(7);
    expect(out.pendingApplications).toBe(3);
  });

  it('reads active tutors from the growth service over a 7-day window', async () => {
    repo.sessionsThisWeek.mockResolvedValue(0);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    growthService.getActiveUsers.mockResolvedValue({ activeTutors: 0, activeStudents: 0, windowDays: 7 });
    repo.pendingApplicationsCount.mockResolvedValue(0);

    await service.getOverview();
    expect(growthService.getActiveUsers).toHaveBeenCalledWith({ days: 7 });
  });

  it('surfaces a null active-tutor count (pre-migration) without crashing', async () => {
    repo.sessionsThisWeek.mockResolvedValue(0);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    growthService.getActiveUsers.mockResolvedValue({ activeTutors: null, activeStudents: null, windowDays: 7 });
    repo.pendingApplicationsCount.mockResolvedValue(0);

    const out = await service.getOverview();
    expect(out.activeTutors).toBeNull();
  });

  it('caches the overview (repos hit once across two calls)', async () => {
    repo.sessionsThisWeek.mockResolvedValue(1);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    growthService.getActiveUsers.mockResolvedValue({ activeTutors: 1, activeStudents: 1, windowDays: 7 });
    repo.pendingApplicationsCount.mockResolvedValue(1);

    await service.getOverview();
    await service.getOverview();

    expect(repo.sessionsThisWeek).toHaveBeenCalledTimes(1);
  });

  it('invalidateAllMetrics clears the cache', async () => {
    repo.sessionsThisWeek.mockResolvedValue(1);
    repo.paidPaymentsThisMonth.mockResolvedValue([]);
    growthService.getActiveUsers.mockResolvedValue({ activeTutors: 1, activeStudents: 1, windowDays: 7 });
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

// ─── getSessionHistory ───────────────────────────────────────────────────

describe('getSessionHistory', () => {
  const session = (overrides = {}) => ({
    id: 's1',
    status: 'Accepted',
    source: 'Platform',
    startTimestamp: new Date('2026-10-17T19:00:00Z'),
    endTimestamp: new Date('2026-10-17T20:30:00Z'),
    createdAt: new Date('2026-10-15T10:00:00Z'),
    cancelledAt: null,
    course: { code: 'ISIS1221', name: 'Intro' },
    tutor: { id: 't1', name: 'Tutor' },
    students: [{ id: 'u1', name: 'Student', kind: 'Registered' }],
    payments: [],
    ...overrides,
  });

  it('maps each filter to its session statuses (scheduled = Pending + Accepted)', async () => {
    repo.sessionHistory.mockResolvedValue({ rows: [], total: 0 });

    await service.getSessionHistory({ status: 'scheduled' });
    expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: ['Pending', 'Accepted'], limit: 25, offset: 0 });

    await service.getSessionHistory({ status: 'canceled' });
    expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: ['Canceled'], limit: 25, offset: 0 });

    await service.getSessionHistory();
    expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: null, limit: 25, offset: 0 });
  });

  it('falls back to every status for unknown or prototype-key filters', async () => {
    repo.sessionHistory.mockResolvedValue({ rows: [], total: 0 });

    for (const status of ['bogus', 'constructor', '__proto__']) {
      await service.getSessionHistory({ status });
      expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: null, limit: 25, offset: 0 });
    }
  });

  it('clamps limit to 1..100 and offset to >= 0', async () => {
    repo.sessionHistory.mockResolvedValue({ rows: [], total: 0 });

    await service.getSessionHistory({ limit: 5000, offset: -10 });
    expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: null, limit: 100, offset: 0 });

    await service.getSessionHistory({ limit: 0 });
    expect(repo.sessionHistory).toHaveBeenLastCalledWith({ statuses: null, limit: 1, offset: 0 });
  });

  it('shapes rows: duration, external students and Calico net via fees.js', async () => {
    repo.sessionHistory.mockResolvedValue({
      total: 1,
      rows: [session({
        students: [{ id: 'u2', name: 'Manual', kind: 'ExternalTemporary' }],
        payments: [{
          amount: 40000, originalAmount: 40000, discountAmount: 0, tutorPayoutBase: 40000,
          status: 'paid', createdAt: new Date('2026-10-15T10:05:00Z'),
        }],
      })],
    });

    const out = await service.getSessionHistory();
    const [item] = out.items;

    expect(out.total).toBe(1);
    expect(item.durationMinutes).toBe(90);
    expect(item.bookedAt).toEqual(new Date('2026-10-15T10:00:00Z'));
    expect(item.students).toEqual([{ id: 'u2', name: 'Manual', external: true }]);
    expect(item.payment.status).toBe('paid');
    expect(item.payment.charged).toBe(40000);
    // 40000 − 85 % (34000) − Wompi (2.65 % + 700) × 1.19 = 3905.6
    expect(item.payment.calicoNet).toBeCloseTo(3905.6, 1);
    expect(item.payment.paidAt).toEqual(new Date('2026-10-15T10:05:00Z'));
  });

  it('reports pending / failed / none payments without counting them as money', async () => {
    const pay = (status) => ({ amount: 40000, originalAmount: 40000, discountAmount: 0, tutorPayoutBase: 40000, status, createdAt: new Date() });
    repo.sessionHistory.mockResolvedValue({
      total: 3,
      rows: [
        session({ id: 'a', payments: [pay('pending')] }),
        session({ id: 'b', payments: [pay('failed')] }),
        session({ id: 'c', payments: [] }),
      ],
    });

    const { items } = await service.getSessionHistory();

    expect(items.map((i) => i.payment.status)).toEqual(['pending', 'failed', 'none']);
    for (const i of items) {
      expect(i.payment.charged).toBe(0);
      expect(i.payment.calicoNet).toBe(0);
      expect(i.payment.paidAt).toBeNull();
    }
  });
});
