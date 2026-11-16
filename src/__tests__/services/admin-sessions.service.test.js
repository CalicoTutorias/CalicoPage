/**
 * @jest-environment node
 *
 * admin-sessions.service with the repositories mocked: route filters →
 * repository filters (Bogotá days → UTC instants, page clamps), session
 * rows → page items, and unbooked intents → panel items (the
 * `metadata.sweep` contract of the payments sweeper).
 */

jest.mock('@/lib/repositories/admin-metrics.repository', () => ({
  operationsSessions: jest.fn(),
}));
jest.mock('@/lib/repositories/payment-intent.repository', () => ({
  findUnbooked: jest.fn(),
}));
// Fulfillers behind src/lib/payments/checkout.js, unused here.
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));
jest.mock('@/lib/services/event-checkout.service', () => ({ fulfilPaidRegistration: jest.fn() }));

const metricsRepo = require('@/lib/repositories/admin-metrics.repository');
const paymentIntentRepo = require('@/lib/repositories/payment-intent.repository');
const service = require('@/lib/services/admin-sessions.service');
const { makeOperationsRow, makeUnbookedRow } = require('../fixtures/admin-sessions.fixtures');

const NOW = new Date('2026-11-04T17:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  metricsRepo.operationsSessions.mockResolvedValue({ rows: [makeOperationsRow()], total: 1 });
});

describe('listSessions', () => {
  it('test_should_turn_bogota_days_into_utc_bounds_with_an_inclusive_to', async () => {
    await service.listSessions({ from: '2026-11-04', to: '2026-11-04', limit: 25, offset: 0 }, NOW);

    expect(metricsRepo.operationsSessions).toHaveBeenCalledWith({
      filters: {
        statuses: [],
        from: new Date('2026-11-04T05:00:00.000Z'),
        to: new Date('2026-11-05T05:00:00.000Z'),
        search: '',
        upcoming: false,
        missingMeet: false,
        includeTest: false,
      },
      now: NOW,
      limit: 25,
      offset: 0,
    });
  });

  it('test_should_pass_the_flags_and_clamp_the_page', async () => {
    const page = await service.listSessions({
      statuses: ['Accepted'], search: 'ana', upcoming: true, missingMeet: true, includeTest: true, limit: 500, offset: -3,
    }, NOW);

    expect(metricsRepo.operationsSessions).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({
        statuses: ['Accepted'], from: null, to: null, search: 'ana', upcoming: true, missingMeet: true, includeTest: true,
      }),
      limit: 100,
      offset: 0,
    }));
    expect(page).toMatchObject({ total: 1, limit: 100, offset: 0 });
  });

  it('test_should_shape_a_paid_session_with_its_meet_link', async () => {
    const { items } = await service.listSessions({}, NOW);

    expect(items).toEqual([{
      id: 'sess-1',
      status: 'Accepted',
      source: 'Platform',
      startTimestamp: new Date('2026-11-11T15:00:00.000Z'),
      endTimestamp: new Date('2026-11-11T16:00:00.000Z'),
      createdAt: new Date('2026-11-04T13:30:00.000Z'),
      course: { code: 'ISIS1221', name: 'Intro a la Programación' },
      isTest: false,
      tutor: { id: 'tutor-1', name: 'Andrés Tutor', email: 'andres@uniandes.edu.co' },
      students: [{ id: 'stu-1', name: 'Ana Estudiante', email: 'ana@uniandes.edu.co', external: false }],
      meetLink: 'https://meet.google.com/abc-defg-hij',
      missingMeet: false,
      payment: { status: 'paid', amount: 40000, viaWompi: true },
      cancellation: null,
    }]);
  });

  it('test_should_flag_a_missing_meet_link_only_on_accepted_sessions', async () => {
    metricsRepo.operationsSessions.mockResolvedValue({
      total: 3,
      rows: [
        makeOperationsRow({ id: 'a', status: 'Accepted', googleMeetLink: null }),
        makeOperationsRow({ id: 'b', status: 'Accepted', googleMeetLink: '' }),
        makeOperationsRow({ id: 'c', status: 'Pending', googleMeetLink: null }),
      ],
    });

    const { items } = await service.listSessions({}, NOW);

    expect(items.map((s) => [s.id, s.missingMeet, s.meetLink])).toEqual([
      ['a', true, null], ['b', true, null], ['c', false, null],
    ]);
  });

  it('test_should_mark_test_course_sessions', async () => {
    metricsRepo.operationsSessions.mockResolvedValue({
      total: 1,
      rows: [makeOperationsRow({ course: { code: 'TEST123', name: 'Curso de prueba' } })],
    });

    const { items } = await service.listSessions({ includeTest: true }, NOW);

    expect(items[0].isTest).toBe(true);
  });

  it('test_should_report_payment_none_pending_and_manual', async () => {
    const pending = { amount: 30000, originalAmount: 30000, discountAmount: 0, tutorPayoutBase: 30000, status: 'pending', createdAt: NOW, viaWompi: false };
    metricsRepo.operationsSessions.mockResolvedValue({
      total: 2,
      rows: [
        makeOperationsRow({ id: 'none', payments: [] }),
        makeOperationsRow({ id: 'manual', source: 'ManualAdmin', payments: [pending] }),
      ],
    });

    const { items } = await service.listSessions({}, NOW);

    expect(items[0].payment).toEqual({ status: 'none', amount: null, viaWompi: false });
    expect(items[1].payment).toEqual({ status: 'pending', amount: 30000, viaWompi: false });
  });

  it('test_should_describe_who_canceled_and_why', async () => {
    const canceled = (cancelledBy) => makeOperationsRow({
      status: 'Canceled',
      cancelledAt: new Date('2026-11-10T20:00:00.000Z'),
      cancellationReason: 'No pudo asistir',
      cancelledBy,
      students: [{ id: 'stu-1', name: 'Ana', email: 'ana@x.co', kind: 'ExternalTemporary' }],
    });
    metricsRepo.operationsSessions.mockResolvedValue({
      total: 4,
      rows: [canceled('tutor-1'), canceled('stu-1'), canceled('admin-9'), canceled(null)],
    });

    const { items } = await service.listSessions({}, NOW);

    expect(items.map((s) => s.cancellation.by)).toEqual(['tutor', 'student', 'other', null]);
    expect(items[0].cancellation).toEqual({ at: new Date('2026-11-10T20:00:00.000Z'), reason: 'No pudo asistir', by: 'tutor' });
    expect(items[0].students[0].external).toBe(true);
  });
});

describe('listUnbookedPayments', () => {
  it('test_should_ask_for_pending_transactions_older_than_15_minutes', async () => {
    paymentIntentRepo.findUnbooked.mockResolvedValue([]);

    await service.listUnbookedPayments();

    expect(paymentIntentRepo.findUnbooked).toHaveBeenCalledWith({ pendingAfterMinutes: 15, limit: 200 });
  });

  it('test_should_read_the_sweep_verdict_and_the_frozen_amount', async () => {
    paymentIntentRepo.findUnbooked.mockResolvedValue([makeUnbookedRow()]);

    const [item] = await service.listUnbookedPayments();

    expect(item).toEqual({
      reference: 'CALICO-1730000000-abc',
      kind: 'session',
      createdAt: new Date('2026-11-04T12:00:00.000Z'),
      student: { name: 'Ana Estudiante', email: 'ana@uniandes.edu.co' },
      tutor: { name: 'Andrés Tutor' },
      course: { code: 'ISIS1221', name: 'Intro a la Programación' },
      event: null,
      slotStart: '2026-11-11T15:00:00.000Z',
      amount: 40000,
      transactionId: 'wompi-tx-1',
      sweep: {
        status: 'APPROVED',
        outcome: 'NEEDS_ATTENTION',
        reason: 'SESSION_CONFLICT',
        checkedAt: '2026-11-04T12:30:00.000Z',
      },
    });
    // Booking metadata (topics, attachments, coupon snapshot…) never leaves the service.
    expect(JSON.stringify(item)).not.toContain('private notes');
  });

  it('test_should_fall_back_to_the_pinned_pending_transaction_when_not_swept_yet', async () => {
    const { sweep, ...metadata } = makeUnbookedRow().metadata;
    paymentIntentRepo.findUnbooked.mockResolvedValue([
      makeUnbookedRow({ metadata: { ...metadata, pendingTransactionId: 'pending-tx-9' } }),
    ]);

    const [item] = await service.listUnbookedPayments();

    expect(sweep).toBeDefined();
    expect(item.sweep).toBeNull();
    expect(item.transactionId).toBe('pending-tx-9');
  });

  it('test_should_keep_a_null_wompi_status_when_the_sweeper_could_not_ask_wompi', async () => {
    const { sweep, ...metadata } = makeUnbookedRow().metadata;
    paymentIntentRepo.findUnbooked.mockResolvedValue([makeUnbookedRow({
      metadata: {
        ...metadata,
        pendingTransactionId: 'pending-tx-9',
        sweep: { ...sweep, status: null, transactionId: null, outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE' },
      },
    })]);

    const [item] = await service.listUnbookedPayments();

    expect(item.sweep).toEqual({
      status: null, outcome: 'ERROR', reason: 'PROVIDER_UNAVAILABLE', checkedAt: '2026-11-04T12:30:00.000Z',
    });
    expect(item.transactionId).toBe('pending-tx-9');
  });

  it('test_should_take_the_event_date_and_final_amount_for_event_intents', async () => {
    paymentIntentRepo.findUnbooked.mockResolvedValue([makeUnbookedRow({
      kind: 'event',
      tutor_name: null,
      course_code: null,
      course_name: null,
      event_title: 'Repaso parcial 2',
      event_starts_at: new Date('2026-11-20T23:00:00.000Z'),
      metadata: {
        kind: 'event',
        eventId: 'evt-1',
        registrationId: 'reg-1',
        studentId: 'stu-1',
        listPrice: '20000',
        discountAmount: '2000',
        finalAmount: '18000',
        sweep: { status: 'APPROVED', transactionId: 'tx-evt', outcome: 'ERROR', reason: 'timeout', checkedAt: '2026-11-04T12:30:00.000Z' },
      },
    })]);

    const [item] = await service.listUnbookedPayments();

    expect(item).toMatchObject({
      kind: 'event',
      event: { title: 'Repaso parcial 2' },
      tutor: null,
      course: null,
      slotStart: new Date('2026-11-20T23:00:00.000Z'),
      amount: 18000,
      transactionId: 'tx-evt',
    });
  });

  it('test_should_leave_the_amount_empty_for_a_legacy_intent_without_snapshot', async () => {
    const { originalAmount, discountAmount, tutorPayoutBase, ...legacy } = makeUnbookedRow().metadata;
    paymentIntentRepo.findUnbooked.mockResolvedValue([makeUnbookedRow({ metadata: legacy })]);

    const [item] = await service.listUnbookedPayments();

    expect([originalAmount, discountAmount, tutorPayoutBase]).toEqual(['40000', '0', '40000']);
    expect(item.amount).toBeNull();
  });
});
