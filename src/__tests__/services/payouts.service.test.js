/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/services/payouts.service.js` — the manual tutor
 * payout flow.
 *
 * The repository, audit service and metrics-cache invalidation are mocked; the
 * fee math (fees.js) is REAL so the amounts owed are validated end-to-end.
 * Coverage focuses on: the per-tutor aggregation + sorting, the per-payment
 * breakdown, input validation, and the side effects every mutation must have
 * (cache invalidation + an audit-log entry).
 */

jest.mock('@/lib/repositories/payouts.repository', () => ({
  aggregatePendingByTutor: jest.fn(),
  findPayments: jest.fn(),
  markPayoutAsPaid: jest.fn(),
  markPayoutsAsPaid: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {},
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({
  invalidateAllMetrics: jest.fn(),
}));

const repo = require('@/lib/repositories/payouts.repository');
const auditService = require('@/lib/services/admin-audit.service');
const { invalidateAllMetrics } = require('@/lib/services/admin-metrics.service');
const service = require('@/lib/services/payouts.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── listPendingPayoutsByTutor ───────────────────────────────────────────

describe('listPendingPayoutsByTutor', () => {
  beforeEach(() => {
    repo.aggregatePendingByTutor.mockResolvedValue([
      {
        tutor: { id: 'tA', name: 'Ana', tutorProfile: { llave: 'ana@nequi' } },
        totalGross: 200000,
        wompiGross: 200000,
        wompiCount: 2,
        typeCounts: { wompi: 2, manual: 0, courtesy: 0 },
        paymentsCount: 2,
        paymentIds: ['p1', 'p2'],
      },
      {
        tutor: { id: 'tB', name: 'Beto', tutorProfile: null },
        totalGross: 50000,
        wompiGross: 50000,
        wompiCount: 1,
        typeCounts: { wompi: 1, manual: 0, courtesy: 0 },
        paymentsCount: 1,
        paymentIds: ['p3'],
      },
    ]);
  });

  it('computes each tutor owed as 85% of their gross', async () => {
    const { groups } = await service.listPendingPayoutsByTutor();

    const ana = groups.find((g) => g.tutor.id === 'tA');
    const beto = groups.find((g) => g.tutor.id === 'tB');
    expect(ana.tutorOwed).toBeCloseTo(170000, 2);  // 85% of 200000
    expect(beto.tutorOwed).toBeCloseTo(42500, 2);   // 85% of 50000
  });

  it('sorts tutors by amount owed, descending', async () => {
    const { groups } = await service.listPendingPayoutsByTutor();
    expect(groups.map((g) => g.tutor.id)).toEqual(['tA', 'tB']);
  });

  it('exposes the llave, or null when the tutor profile lacks one', async () => {
    const { groups } = await service.listPendingPayoutsByTutor();
    expect(groups.find((g) => g.tutor.id === 'tA').llave).toBe('ana@nequi');
    expect(groups.find((g) => g.tutor.id === 'tB').llave).toBeNull();
  });

  it('aggregates headline totals across all pending payouts', async () => {
    const { totals } = await service.listPendingPayoutsByTutor();

    expect(totals.gross).toBe(250000);
    expect(totals.tutorOwed).toBeCloseTo(212500, 2);  // 170000 + 42500
    expect(totals.calicoNet).toBeCloseTo(27117.25, 2);
    expect(totals.wompiFee).toBeCloseTo(10382.75, 2);
    expect(totals.tutorsCount).toBe(2);
    expect(totals.paymentsCount).toBe(3);
  });

  it('test_should_charge_the_wompi_fee_only_on_real_wompi_charges', async () => {
    repo.aggregatePendingByTutor.mockResolvedValue([
      {
        tutor: { id: 'tA', name: 'Ana', tutorProfile: null },
        totalGross: 200000,
        wompiGross: 100000,
        wompiCount: 1,
        typeCounts: { wompi: 1, manual: 1, courtesy: 0 },
        paymentsCount: 2,
        paymentIds: ['p1', 'p2'],
      },
    ]);

    const { totals, groups } = await service.listPendingPayoutsByTutor();

    expect(totals.wompiFee).toBeCloseTo(3986.5, 2); // the 100 000 Wompi charge alone
    expect(totals.calicoNet).toBeCloseTo(26013.5, 2); // 15 % of 200 000 − that fee
    expect(groups[0].typeCounts).toEqual({ wompi: 1, manual: 1, courtesy: 0 });
  });

  it('test_should_keep_calicos_whole_commission_on_manual_payments_only', async () => {
    repo.aggregatePendingByTutor.mockResolvedValue([
      {
        tutor: { id: 'tA', name: 'Ana', tutorProfile: null },
        totalGross: 75000,
        wompiGross: 0,
        wompiCount: 0,
        typeCounts: { wompi: 0, manual: 1, courtesy: 0 },
        paymentsCount: 1,
        paymentIds: ['p1'],
      },
    ]);

    const { totals } = await service.listPendingPayoutsByTutor();

    expect(totals.wompiFee).toBe(0);
    expect(totals.calicoNet).toBe(11250);
  });
});

// ─── listPayoutPayments ──────────────────────────────────────────────────

describe('listPayoutPayments', () => {
  const row = (overrides = {}) => ({
    id: 'p1',
    amount: 100000,
    wompiId: 'tx-1',
    createdAt: new Date('2026-05-01'),
    tutorPayoutStatus: 'pending',
    tutorPayoutAt: null,
    tutorPayoutNote: null,
    tutor: { id: 'tA', tutorProfile: { llave: 'ana@nequi' } },
    session: { id: 's1', source: 'Platform' },
    ...overrides,
  });

  it('returns a per-payment breakdown (gross / owed / net / fee)', async () => {
    repo.findPayments.mockResolvedValue({ items: [row()], total: 1 });

    const { items: [item], total } = await service.listPayoutPayments({});

    expect(total).toBe(1);
    expect(item.gross).toBe(100000);
    expect(item.tutorOwed).toBeCloseTo(85000, 2);
    expect(item.calicoNet).toBeCloseTo(11013.5, 2);
    expect(item.wompiFee).toBeCloseTo(3986.5, 2);
    expect(item.llave).toBe('ana@nequi');
    expect(item.paymentType).toBe('wompi');
  });

  it('test_should_not_charge_a_wompi_fee_on_a_manual_payment', async () => {
    repo.findPayments.mockResolvedValue({
      items: [row({ wompiId: null, session: { id: 's1', source: 'ManualAdmin' } })],
      total: 1,
    });

    const { items: [item] } = await service.listPayoutPayments({});

    expect(item.paymentType).toBe('manual');
    expect(item.wompiFee).toBe(0);
    expect(item.calicoNet).toBe(15000);
    expect(item.tutorOwed).toBe(85000);
  });

  it('test_should_label_a_courtesy_booking_and_still_owe_the_tutor', async () => {
    repo.findPayments.mockResolvedValue({
      items: [row({ amount: 0, originalAmount: 50000, discountAmount: 50000, tutorPayoutBase: 50000, wompiId: null })],
      total: 1,
    });

    const { items: [item] } = await service.listPayoutPayments({});

    expect(item.paymentType).toBe('courtesy');
    expect(item.wompiFee).toBe(0);
    expect(item.tutorOwed).toBe(42500);
  });

  it('test_should_say_whether_the_tutor_was_paid', async () => {
    const paidAt = new Date('2026-06-01');
    repo.findPayments.mockResolvedValue({
      items: [row({ tutorPayoutStatus: 'paid', tutorPayoutAt: paidAt, tutorPayoutNote: 'Nequi 123' })],
      total: 1,
    });

    const { items: [item] } = await service.listPayoutPayments({});

    expect(item).toEqual(expect.objectContaining({
      tutorPayoutStatus: 'paid',
      tutorPayoutAt: paidAt,
      tutorPayoutNote: 'Nequi 123',
    }));
  });

  it('forwards listing options to the repository', async () => {
    repo.findPayments.mockResolvedValue({ items: [], total: 0 });
    await service.listPayoutPayments({ payout: 'paid', type: 'manual', limit: 20, offset: 40 });
    expect(repo.findPayments).toHaveBeenCalledWith({ payout: 'paid', type: 'manual', limit: 20, offset: 40 });
  });
});

// ─── markPayoutAsPaid ────────────────────────────────────────────────────

describe('markPayoutAsPaid', () => {
  it('rejects a missing payment id with INVALID_INPUT', async () => {
    await expect(
      service.markPayoutAsPaid({ paymentId: null, adminId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repo.markPayoutAsPaid).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the repository finds nothing to mark', async () => {
    repo.markPayoutAsPaid.mockResolvedValue(null);

    await expect(
      service.markPayoutAsPaid({ paymentId: 'p1', adminId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(invalidateAllMetrics).not.toHaveBeenCalled();
  });

  it('invalidates metrics and writes an audit entry on success', async () => {
    repo.markPayoutAsPaid.mockResolvedValue({ id: 'p1', tutorId: 'tA', amount: 100000 });

    const result = await service.markPayoutAsPaid({
      paymentId: 'p1',
      adminId: 'admin-1',
      note: 'pagado por Nequi',
    });

    expect(invalidateAllMetrics).toHaveBeenCalledTimes(1);
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'TUTOR_PAYOUT_MARKED',
        targetType: 'Payment',
        targetId: 'p1',
        payload: expect.objectContaining({ tutorId: 'tA', note: 'pagado por Nequi', gross: 100000 }),
      }),
    );
    expect(result).toEqual({ id: 'p1', tutorId: 'tA', amount: 100000 });
  });
});

// ─── bulkMarkPayoutsAsPaid ───────────────────────────────────────────────

describe('bulkMarkPayoutsAsPaid', () => {
  it('rejects an empty or non-array list with INVALID_INPUT', async () => {
    await expect(
      service.bulkMarkPayoutsAsPaid({ paymentIds: [], adminId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    await expect(
      service.bulkMarkPayoutsAsPaid({ paymentIds: 'p1', adminId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(repo.markPayoutsAsPaid).not.toHaveBeenCalled();
  });

  it('marks the batch, invalidates metrics and audits the bulk action', async () => {
    repo.markPayoutsAsPaid.mockResolvedValue({ count: 3 });

    const result = await service.bulkMarkPayoutsAsPaid({
      paymentIds: ['p1', 'p2', 'p3'],
      adminId: 'admin-1',
      note: 'lote semanal',
    });

    expect(repo.markPayoutsAsPaid).toHaveBeenCalledWith(
      ['p1', 'p2', 'p3'],
      { adminId: 'admin-1', note: 'lote semanal' },
    );
    expect(invalidateAllMetrics).toHaveBeenCalledTimes(1);
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'TUTOR_PAYOUT_BULK',
        payload: expect.objectContaining({ paymentIds: ['p1', 'p2', 'p3'], count: 3 }),
      }),
    );
    expect(result).toEqual({ count: 3 });
  });
});
