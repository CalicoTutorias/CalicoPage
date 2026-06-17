/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/services/admin-growth.service.js`.
 *
 * The service is where the raw repository aggregates become the rates the
 * Crecimiento page renders, so the tests pin down: the derived fractions
 * (and their divide-by-zero guards), the day/month clamping, rounding,
 * null pass-through, the in-memory cache, and the profitability mapping —
 * which is checked against the REAL fees.js (not mocked) so the money math
 * is validated end-to-end.
 */

jest.mock('@/lib/repositories/admin-growth.repository', () => ({
  repeatOverview: jest.fn(),
  retentionCohorts: jest.fn(),
  courseProfitability: jest.fn(),
  activeUsersSince: jest.fn(),
}));

const repo = require('@/lib/repositories/admin-growth.repository');
const service = require('@/lib/services/admin-growth.service');

beforeEach(() => {
  jest.clearAllMocks();
  service.invalidateGrowth(); // cache is module-level — reset between tests
});

// ─── getRetentionOverview ────────────────────────────────────────────────

describe('getRetentionOverview', () => {
  it('derives repeatRate and sameTutorRate from the repo counts', async () => {
    repo.repeatOverview.mockResolvedValue({
      students: 100,
      repeaters: 40,
      sameTutorRepeaters: 30,
      medianGapDays: 12.345,
      repeatTicket: 50000.7,
      newTicket: 42000.4,
    });

    const out = await service.getRetentionOverview({ days: 90 });

    expect(out.repeatRate).toBeCloseTo(0.4, 10);        // 40 / 100
    expect(out.sameTutorRate).toBeCloseTo(0.75, 10);    // 30 / 40
    expect(out.medianDaysBetween).toBe(12.35);          // round2
    expect(out.repeatTicket).toBe(50000.7);
    expect(out.newTicket).toBe(42000.4);
  });

  it('guards against divide-by-zero (no students / no repeaters)', async () => {
    repo.repeatOverview.mockResolvedValue({
      students: 0,
      repeaters: 0,
      sameTutorRepeaters: 0,
      medianGapDays: null,
      repeatTicket: null,
      newTicket: null,
    });

    const out = await service.getRetentionOverview({ days: 30 });

    expect(out.repeatRate).toBe(0);
    expect(out.sameTutorRate).toBe(0);
    expect(out.medianDaysBetween).toBeNull();
    expect(out.repeatTicket).toBeNull();
    expect(out.newTicket).toBeNull();
  });

  it('clamps days into the 1..365 range before querying', async () => {
    repo.repeatOverview.mockResolvedValue({ students: 1, repeaters: 0, sameTutorRepeaters: 0 });

    await service.getRetentionOverview({ days: 0 });
    expect(repo.repeatOverview).toHaveBeenCalledWith({ days: 1, careerId: null });

    service.invalidateGrowth();
    await service.getRetentionOverview({ days: 9999 });
    expect(repo.repeatOverview).toHaveBeenLastCalledWith({ days: 365, careerId: null });
  });

  it('passes careerId through to the repository', async () => {
    repo.repeatOverview.mockResolvedValue({ students: 1, repeaters: 0, sameTutorRepeaters: 0 });
    await service.getRetentionOverview({ days: 90, careerId: 'career-42' });
    expect(repo.repeatOverview).toHaveBeenCalledWith({ days: 90, careerId: 'career-42' });
  });
});

// ─── caching ─────────────────────────────────────────────────────────────

describe('cache behaviour', () => {
  it('serves a second identical call from cache (repo hit only once)', async () => {
    repo.repeatOverview.mockResolvedValue({ students: 10, repeaters: 5, sameTutorRepeaters: 2 });

    await service.getRetentionOverview({ days: 90, careerId: 'c1' });
    await service.getRetentionOverview({ days: 90, careerId: 'c1' });

    expect(repo.repeatOverview).toHaveBeenCalledTimes(1);
  });

  it('uses a separate cache entry per careerId', async () => {
    repo.repeatOverview.mockResolvedValue({ students: 10, repeaters: 5, sameTutorRepeaters: 2 });

    await service.getRetentionOverview({ days: 90, careerId: 'c1' });
    await service.getRetentionOverview({ days: 90, careerId: 'c2' });

    expect(repo.repeatOverview).toHaveBeenCalledTimes(2);
  });

  it('invalidateGrowth forces a fresh repo read', async () => {
    repo.repeatOverview.mockResolvedValue({ students: 10, repeaters: 5, sameTutorRepeaters: 2 });

    await service.getRetentionOverview({ days: 90 });
    service.invalidateGrowth();
    await service.getRetentionOverview({ days: 90 });

    expect(repo.repeatOverview).toHaveBeenCalledTimes(2);
  });
});

// ─── getActiveUsers ──────────────────────────────────────────────────────

describe('getActiveUsers', () => {
  it('returns the repo counts and clamps days into the 1..90 range', async () => {
    repo.activeUsersSince.mockResolvedValue({ activeTutors: 4, activeStudents: 9, windowDays: 7 });

    const out = await service.getActiveUsers({ days: 7 });
    expect(out).toEqual({ activeTutors: 4, activeStudents: 9, windowDays: 7 });

    service.invalidateGrowth();
    await service.getActiveUsers({ days: 999 });
    expect(repo.activeUsersSince).toHaveBeenLastCalledWith({ days: 90 });
  });

  it('degrades to null counts when the repo throws (migration not run yet)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    repo.activeUsersSince.mockRejectedValue(new Error('column last_seen_at does not exist'));

    const out = await service.getActiveUsers({ days: 7 });
    expect(out).toEqual({ activeTutors: null, activeStudents: null, windowDays: 7 });
    warnSpy.mockRestore();
  });
});

// ─── getRetentionCohorts ─────────────────────────────────────────────────

describe('getRetentionCohorts', () => {
  it('computes 30/60/90-day return rates per cohort', async () => {
    repo.retentionCohorts.mockResolvedValue([
      { cohortMonth: '2026-01', newStudents: 50, d30: 10, d60: 20, d90: 25 },
    ]);

    const [c] = await service.getRetentionCohorts({ months: 12 });

    expect(c.rate30).toBeCloseTo(0.2, 10);   // 10 / 50
    expect(c.rate60).toBeCloseTo(0.4, 10);   // 20 / 50
    expect(c.rate90).toBeCloseTo(0.5, 10);   // 25 / 50
    expect(c.newStudents).toBe(50);
  });

  it('returns zero rates for an empty cohort (no newStudents)', async () => {
    repo.retentionCohorts.mockResolvedValue([
      { cohortMonth: '2026-02', newStudents: 0, d30: 0, d60: 0, d90: 0 },
    ]);

    const [c] = await service.getRetentionCohorts({ months: 6 });
    expect(c.rate30).toBe(0);
    expect(c.rate60).toBe(0);
    expect(c.rate90).toBe(0);
  });

  it('clamps months into the 1..36 range', async () => {
    repo.retentionCohorts.mockResolvedValue([]);

    await service.getRetentionCohorts({ months: 99 });
    expect(repo.retentionCohorts).toHaveBeenCalledWith({ months: 36, careerId: null });
  });
});

// ─── getCourseProfitability (integrated with real fees.js) ───────────────

describe('getCourseProfitability', () => {
  it('applies the real fee math and flags profitable courses', async () => {
    repo.courseProfitability.mockResolvedValue([
      {
        id: 'course-1', code: 'ISIS3710', name: 'Web',
        gross: 100000, paymentsCount: 1, sessions: 2,
        listPrice: null, basePrice: 50000,
      },
    ]);

    const [row] = await service.getCourseProfitability({ days: 90 });

    // From fees.js: net on 100000 gross / 1 tx = 11013.5
    expect(row.gross).toBe(100000);
    expect(row.calicoNet).toBeCloseTo(11013.5, 2);
    expect(row.tutorPayout).toBeCloseTo(85000, 2);
    expect(row.netPerSession).toBeCloseTo(5506.75, 2); // 11013.5 / 2 sessions
    expect(row.unprofitable).toBe(false);
    expect(row.listPrice).toBe(50000);                 // falls back to basePrice
    expect(row.breakEvenPrice).toBe(7032);             // ceil(breakEvenPrice())
  });

  it('flags a course as unprofitable when net is <= 0', async () => {
    repo.courseProfitability.mockResolvedValue([
      {
        id: 'course-2', code: 'LOW1000', name: 'Cheap',
        gross: 1000, paymentsCount: 1, sessions: 1,
        listPrice: 1000, basePrice: 1000,
      },
    ]);

    const [row] = await service.getCourseProfitability({ days: 90 });
    expect(row.calicoNet).toBeLessThan(0);
    expect(row.unprofitable).toBe(true);
    expect(row.listPrice).toBe(1000); // uses listPrice when present
  });

  it('reports netPerSession of 0 when there are no sessions', async () => {
    repo.courseProfitability.mockResolvedValue([
      {
        id: 'course-3', code: 'X', name: 'X',
        gross: 0, paymentsCount: 0, sessions: 0,
        listPrice: null, basePrice: null,
      },
    ]);

    const [row] = await service.getCourseProfitability({ days: 90 });
    expect(row.netPerSession).toBe(0);
    expect(row.listPrice).toBeNull();
  });

  it('clamps days before querying profitability', async () => {
    repo.courseProfitability.mockResolvedValue([]);
    await service.getCourseProfitability({ days: -5 });
    expect(repo.courseProfitability).toHaveBeenCalledWith({ days: 1 });
  });
});
