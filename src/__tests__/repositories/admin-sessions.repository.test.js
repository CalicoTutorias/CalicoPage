/**
 * @jest-environment node
 *
 * Admin "Tutorías" page queries with a mocked Prisma:
 *   - operationsWhere: every filter → its Prisma `where` fragment
 *   - operationsSessions: where / order / select handed to Prisma
 *   - sessionHistory keeps the dashboard's select (shared helper refactor)
 *   - payment-intent findUnbooked: the SQL predicates of the contract
 * Real-Postgres behaviour of the same queries: src/__integration__/admin-sessions.int.test.js.
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
const repo = require('@/lib/repositories/admin-metrics.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const { COUNTED_SESSION_WHERE } = require('@/lib/repositories/metrics-exclusions');

const NOW = new Date('2026-11-04T17:00:00.000Z');
const insensitive = (q) => ({ contains: q, mode: 'insensitive' });

beforeEach(() => jest.clearAllMocks());

describe('operationsWhere', () => {
  it('test_should_exclude_test_courses_and_nothing_else_by_default', () => {
    expect(repo.operationsWhere({}, NOW)).toEqual({ AND: [COUNTED_SESSION_WHERE] });
  });

  it('test_should_drop_the_test_course_exclusion_when_include_test', () => {
    expect(repo.operationsWhere({ includeTest: true }, NOW)).toEqual({ AND: [] });
  });

  it('test_should_filter_by_every_selected_status', () => {
    const where = repo.operationsWhere({ statuses: ['Pending', 'Accepted'], includeTest: true }, NOW);
    expect(where).toEqual({ AND: [{ status: { in: ['Pending', 'Accepted'] } }] });
  });

  it('test_should_bound_the_start_with_from_inclusive_and_to_exclusive', () => {
    const from = new Date('2026-11-01T05:00:00.000Z');
    const to = new Date('2026-12-01T05:00:00.000Z');
    expect(repo.operationsWhere({ from, to, includeTest: true }, NOW)).toEqual({
      AND: [{ startTimestamp: { gte: from } }, { startTimestamp: { lt: to } }],
    });
  });

  it('test_should_keep_only_sessions_starting_from_now_when_upcoming', () => {
    expect(repo.operationsWhere({ upcoming: true, includeTest: true }, NOW)).toEqual({
      AND: [{ startTimestamp: { gte: NOW } }],
    });
  });

  it('test_should_match_accepted_sessions_without_meet_link_when_missing_meet', () => {
    expect(repo.operationsWhere({ missingMeet: true, includeTest: true }, NOW)).toEqual({
      AND: [{ status: 'Accepted', OR: [{ googleMeetLink: null }, { googleMeetLink: '' }] }],
    });
  });

  it('test_should_search_students_tutor_and_course_case_insensitively', () => {
    expect(repo.operationsWhere({ search: '  Ana@Uni ', includeTest: true }, NOW)).toEqual({
      AND: [{
        OR: [
          { participants: { some: { student: { OR: [{ name: insensitive('Ana@Uni') }, { email: insensitive('Ana@Uni') }] } } } },
          { tutor: { OR: [{ name: insensitive('Ana@Uni') }, { email: insensitive('Ana@Uni') }] } },
          { course: { OR: [{ code: insensitive('Ana@Uni') }, { name: insensitive('Ana@Uni') }] } },
        ],
      }],
    });
  });

  it('test_should_ignore_a_blank_search', () => {
    expect(repo.operationsWhere({ search: '   ' }, NOW)).toEqual({ AND: [COUNTED_SESSION_WHERE] });
  });

  it('test_should_combine_filters_with_and_without_overwriting_each_other', () => {
    const where = repo.operationsWhere({ statuses: ['Canceled'], missingMeet: true, upcoming: true, search: 'x' }, NOW);
    // Two status conditions and two course conditions stay separate AND terms.
    expect(where.AND).toHaveLength(5);
    expect(where.AND[0]).toBe(COUNTED_SESSION_WHERE);
    expect(where.AND).toContainEqual({ status: { in: ['Canceled'] } });
    expect(where.AND).toContainEqual(expect.objectContaining({ status: 'Accepted' }));
  });
});

describe('operationsSessions', () => {
  it('test_should_send_the_same_where_to_the_page_and_the_count_latest_first', async () => {
    await repo.operationsSessions({ filters: { statuses: ['Accepted'] }, now: NOW, limit: 10, offset: 20 });

    const args = prisma.session.findMany.mock.calls[0][0];
    const where = repo.operationsWhere({ statuses: ['Accepted'] }, NOW);
    expect(args.where).toEqual(where);
    expect(args.orderBy).toEqual([{ startTimestamp: 'desc' }, { id: 'asc' }]);
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
    expect(prisma.session.count).toHaveBeenCalledWith({ where });
  });

  it('test_should_order_soonest_first_when_upcoming', async () => {
    await repo.operationsSessions({ filters: { upcoming: true }, now: NOW });

    expect(prisma.session.findMany.mock.calls[0][0].orderBy).toEqual([{ startTimestamp: 'asc' }, { id: 'asc' }]);
  });

  it('test_should_select_contact_and_meet_fields_but_never_credentials', async () => {
    await repo.operationsSessions({ now: NOW });

    const { select } = prisma.session.findMany.mock.calls[0][0];
    expect(select).toMatchObject({
      googleMeetLink: true,
      cancellationReason: true,
      cancelledBy: true,
      tutor: { select: { id: true, name: true, email: true } },
      participants: { select: { student: { select: { id: true, name: true, email: true, kind: true } } } },
    });
    const json = JSON.stringify(select);
    for (const field of ['passwordHash', 'verificationToken', 'resetToken', 'otpCode', 'studentRating', 'phoneNumber']) {
      expect(json).not.toContain(field);
    }
  });

  it('test_should_shape_rows_like_the_dashboard_history', async () => {
    prisma.session.findMany.mockResolvedValueOnce([{
      id: 's1',
      googleMeetLink: null,
      participants: [{ student: { id: 'u1', name: 'Ana', email: 'ana@x.co', kind: 'Registered' } }],
      payments: [{
        amount: '40000.00', originalAmount: '40000.00', discountAmount: '0', tutorPayoutBase: '40000.00',
        status: 'paid', createdAt: NOW, wompiId: 'tx-secret',
      }],
    }]);
    prisma.session.count.mockResolvedValueOnce(1);

    const { rows, total } = await repo.operationsSessions({ now: NOW });

    expect(total).toBe(1);
    expect(rows[0].students).toEqual([{ id: 'u1', name: 'Ana', email: 'ana@x.co', kind: 'Registered' }]);
    expect(rows[0].payments[0]).toMatchObject({ amount: 40000, status: 'paid', viaWompi: true });
    expect(JSON.stringify(rows)).not.toContain('tx-secret');
  });
});

it('test_should_keep_the_dashboard_history_select_unchanged', async () => {
  await repo.sessionHistory({ limit: 25, offset: 0 });

  const args = prisma.session.findMany.mock.calls[0][0];
  expect(args.orderBy).toEqual([{ startTimestamp: 'desc' }, { id: 'asc' }]);
  expect(args.select.tutor).toEqual({ select: { id: true, name: true } });
  expect(args.select.participants).toEqual({ select: { student: { select: { id: true, name: true, kind: true } } } });
  expect(args.select).not.toHaveProperty('googleMeetLink');
  expect(args.select).not.toHaveProperty('cancellationReason');
});

describe('payment-intent findUnbooked', () => {
  /** SQL text + bound values of the last `$queryRaw` call. */
  function lastQuery() {
    const [strings, ...values] = prisma.$queryRaw.mock.calls.at(-1);
    return Prisma.sql(strings, ...values);
  }
  const squash = (sql) => sql.replace(/\s+/g, ' ');

  it('test_should_list_only_unconsumed_intents_with_an_approved_sweep_or_an_old_pending_transaction', async () => {
    await paymentIntentRepo.findUnbooked({ pendingAfterMinutes: 15, limit: 200 });

    const query = lastQuery();
    const sql = squash(query.text);
    expect(sql).toContain('WHERE pi.consumed_at IS NULL');
    expect(sql).toContain("pi.metadata->'sweep'->>'status' = 'APPROVED'");
    expect(sql).toContain("COALESCE(pi.metadata->>'pendingTransactionId', '') <> ''");
    expect(sql).toContain("COALESCE(pi.metadata->'sweep'->>'status', '') NOT IN ('DECLINED', 'VOIDED', 'ERROR')");
    expect(sql).toContain("COALESCE(pi.metadata->'sweep'->>'outcome', '') <> 'ALREADY_PROCESSED'");
    expect(sql).toMatch(/pi\.created_at < \(NOW\(\) AT TIME ZONE 'UTC'\) - \(\$1::int \* INTERVAL '1 minute'\)/);
    expect(sql).toContain('ORDER BY pi.created_at DESC');
    expect(query.values).toEqual([15, 200]);
  });

  it('test_should_resolve_names_from_the_ids_in_the_metadata', async () => {
    await paymentIntentRepo.findUnbooked();

    const sql = squash(lastQuery().text);
    expect(sql).toContain("LEFT JOIN users st ON st.id = pi.metadata->>'studentId'");
    expect(sql).toContain("LEFT JOIN users tu ON tu.id = pi.metadata->>'tutorId'");
    expect(sql).toContain("LEFT JOIN courses c ON c.id = pi.metadata->>'courseId'");
    expect(sql).toContain("LEFT JOIN events e ON e.id = pi.metadata->>'eventId'");
    expect(sql).not.toMatch(/password_hash|otp_code|reset_token|verification_token|student_rating/);
  });
});
