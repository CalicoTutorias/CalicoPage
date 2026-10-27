/**
 * @jest-environment node
 *
 * Test courses (TEST123) must never reach a Dashboard / Crecimiento number.
 * Every repository query that reads sessions or payments is called with a
 * mocked Prisma and the SQL it sends is checked for the exclusion predicate.
 */

jest.mock('@/lib/prisma', () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    session: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
  return { __esModule: true, default: prisma };
});

const prisma = require('@/lib/prisma').default;
const { Prisma } = require('@/generated/prisma');
const metricsRepo = require('@/lib/repositories/admin-metrics.repository');
const growthRepo = require('@/lib/repositories/admin-growth.repository');
const {
  countedSession,
  COUNTED_SESSION_WHERE,
  METRICS_EXCLUDED_COURSE_CODES,
} = require('@/lib/repositories/metrics-exclusions');

beforeEach(() => jest.clearAllMocks());

/** The SQL text + bound values of the last `$queryRaw` tagged-template call. */
function lastQuery() {
  const [strings, ...values] = prisma.$queryRaw.mock.calls.at(-1);
  return Prisma.sql(strings, ...values);
}

const exclusions = (query) => query.sql.split('course_id NOT IN').length - 1;

it('excludes the TEST123 course', () => {
  expect(METRICS_EXCLUDED_COURSE_CODES).toContain('TEST123');
});

describe.each([
  ['sessionsThisWeek',      () => metricsRepo.sessionsThisWeek(),      1],
  ['revenueThisMonth',      () => metricsRepo.revenueThisMonth(),      1],
  ['paidPaymentsThisMonth', () => metricsRepo.paidPaymentsThisMonth(), 1],
  ['activeTutorsCount',     () => metricsRepo.activeTutorsCount(),     1],
  ['sessionsByWeek',        () => metricsRepo.sessionsByWeek(),        1],
  ['revenueByMonth',        () => metricsRepo.revenueByMonth(),        1],
  ['topCourses',            () => metricsRepo.topCourses(),            1],
  ['topTutors',             () => metricsRepo.topTutors(),             1],
  ['repeatOverview',        () => growthRepo.repeatOverview(),         1],
  ['retentionCohorts',      () => growthRepo.retentionCohorts(),       2], // first AND second session
  ['courseProfitability',   () => growthRepo.courseProfitability(),    1],
])('%s', (_name, run, expected) => {
  it('filters out test-course sessions', async () => {
    await run();
    const query = lastQuery();

    expect(exclusions(query)).toBe(expected);
    expect(query.values.filter((v) => v === 'TEST123')).toHaveLength(expected);
  });
});

it('sessionHistory scopes both the page and the count to real courses', async () => {
  await metricsRepo.sessionHistory({ statuses: ['Canceled'] });

  const expectedWhere = { ...COUNTED_SESSION_WHERE, status: { in: ['Canceled'] } };
  expect(prisma.session.findMany.mock.calls[0][0].where).toEqual(expectedWhere);
  expect(prisma.session.count).toHaveBeenCalledWith({ where: expectedWhere });

  await metricsRepo.sessionHistory();
  expect(prisma.session.count).toHaveBeenLastCalledWith({ where: COUNTED_SESSION_WHERE });
});

it('countedSession only accepts plain SQL identifiers as alias', () => {
  expect(() => countedSession('s2')).not.toThrow();
  expect(() => countedSession('s; DROP TABLE users')).toThrow('Invalid SQL alias');
});
