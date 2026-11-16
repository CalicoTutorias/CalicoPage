/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/finance-ledger.service.js — the ledger
 * (libro de movimientos). Repository, S3, audit and the repaso metrics are
 * mocked; the ledger rules (ledger-math.js) and fee math (fees.js) are REAL.
 */

jest.mock('@/lib/repositories/finance.repository', () => ({
  getSettings: jest.fn(),
  upsertSettings: jest.fn(),
  listAccounts: jest.fn(),
  findAccount: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  listCategories: jest.fn(),
  findCategory: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  countEntries: jest.fn(),
  insertProjectedEntries: jest.fn(),
  existingSourceKeys: jest.fn(),
  insertEntries: jest.fn(),
  findEntry: jest.fn(),
  findLinkedEntries: jest.fn(),
  listEntries: jest.fn(),
  allEntries: jest.fn(),
  sumsByAccount: jest.fn(),
  profitEntries: jest.fn(),
  sessionPaymentSources: jest.fn(),
  eventPaymentSources: jest.fn(),
  manualEventChargeSources: jest.fn(),
  eventTutorPayoutSources: jest.fn(),
  heldSessionPayments: jest.fn(),
  pendingTutorShares: jest.fn(),
  pendingEventRefunds: jest.fn(),
  findPaymentForRefund: jest.fn(),
  markSessionPaymentRefunded: jest.fn(),
}));
jest.mock('@/lib/s3', () => ({
  generateUploadUrl: jest.fn(),
  generateDownloadUrl: jest.fn(),
  headObject: jest.fn(),
  setObjectTags: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({ logAction: jest.fn() }));
jest.mock('@/lib/services/admin-metrics.service', () => ({ eventFinance: jest.fn() }));
jest.mock('@/lib/services/payouts.service', () => ({
  listPendingPayoutsByTutor: jest.fn(),
  listEventPayouts: jest.fn(),
}));

const repo = require('@/lib/repositories/finance.repository');
const s3 = require('@/lib/s3');
const audit = require('@/lib/services/admin-audit.service');
const { eventFinance } = require('@/lib/services/admin-metrics.service');
const payouts = require('@/lib/services/payouts.service');
const service = require('@/lib/services/finance-ledger.service');

const CUTOFF = new Date('2026-11-01T05:00:00Z');
const NOW = new Date('2026-11-15T20:00:00Z');
const PROOF = 'finance-proofs/2026-11/0123456789abcdef01234567.png';
const ACCOUNTS = [
  { id: 'acc-wompi', name: 'Wompi', type: 'WOMPI', gmfApplies: false, isActive: true },
  { id: 'acc-bank', name: 'Banco', type: 'BANK', gmfApplies: true, isActive: true },
  { id: 'acc-cash', name: 'Efectivo', type: 'CASH', gmfApplies: false, isActive: true },
];
const SETTINGS = {
  cutoffDate: CUTOFF, gmfRate: '0.00400',
  wompiAccountId: 'acc-wompi', defaultBankAccountId: 'acc-bank', defaultManualAccountId: 'acc-bank',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW });
  repo.getSettings.mockResolvedValue(SETTINGS);
  repo.listAccounts.mockResolvedValue(ACCOUNTS);
  repo.findAccount.mockImplementation(async (id) => ACCOUNTS.find((a) => a.id === id) ?? null);
  repo.insertEntries.mockImplementation(async (rows) => rows.map((r) => ({ ...r, account: { id: r.accountId } })));
  repo.existingSourceKeys.mockResolvedValue(new Set());
  repo.insertProjectedEntries.mockImplementation(async (rows) => rows.length);
  for (const fn of ['sessionPaymentSources', 'eventPaymentSources', 'manualEventChargeSources', 'eventTutorPayoutSources']) {
    repo[fn].mockResolvedValue([]);
  }
  s3.headObject.mockResolvedValue({ contentType: 'image/png', contentLength: 1000 });
});

afterEach(() => jest.useRealTimers());

// ─── resolveTransfer ─────────────────────────────────────────────────────

describe('resolveTransfer', () => {
  it('needs an active account and an uploaded proof after the cutoff', async () => {
    const out = await service.resolveTransfer({ accountId: 'acc-cash', paidAt: '2026-11-14T15:00:00Z', proofS3Key: PROOF });
    expect(out).toEqual({ accountId: 'acc-cash', paidAt: new Date('2026-11-14T15:00:00Z'), proofS3Key: PROOF });
    expect(s3.setObjectTags).toHaveBeenCalledWith(PROOF, { status: 'confirmed' });
  });

  it('defaults to the bank account and today', async () => {
    const out = await service.resolveTransfer({ proofS3Key: PROOF });
    expect(out).toMatchObject({ accountId: 'acc-bank', paidAt: NOW });
  });

  it('refuses a transfer without proof', async () => {
    await expect(service.resolveTransfer({ accountId: 'acc-bank' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', rule: 'PROOF_REQUIRED' });
  });

  it('refuses a proof that was never uploaded', async () => {
    s3.headObject.mockRejectedValue(Object.assign(new Error('nope'), { code: 'NOT_FOUND' }));
    await expect(service.resolveTransfer({ accountId: 'acc-bank', proofS3Key: PROOF }))
      .rejects.toMatchObject({ rule: 'PROOF_NOT_UPLOADED' });
  });

  it('a transfer made before the cutoff is history: no proof needed', async () => {
    const out = await service.resolveTransfer({ paidAt: '2026-10-20T15:00:00Z' });
    expect(out).toEqual({ accountId: null, paidAt: new Date('2026-10-20T15:00:00Z'), proofS3Key: null });
  });

  it('refuses a future date, but today at noon (still ahead) is now', async () => {
    await expect(service.resolveTransfer({ paidAt: '2026-12-01T00:00:00Z', proofS3Key: PROOF }))
      .rejects.toMatchObject({ rule: 'DATE_IN_FUTURE' });
    const out = await service.resolveTransfer({ paidAt: '2026-11-16T17:00:00Z', proofS3Key: PROOF });
    expect(out.paidAt).toEqual(NOW);
  });
});

// ─── syncLedger ──────────────────────────────────────────────────────────

describe('syncLedger', () => {
  it('does nothing until the ledger is configured', async () => {
    repo.getSettings.mockResolvedValue({ ...SETTINGS, cutoffDate: null });
    expect(await service.syncLedger()).toBe(0);
    expect(repo.sessionPaymentSources).not.toHaveBeenCalled();
  });

  it('projects only the entries that are missing, with their 4x1000', async () => {
    repo.sessionPaymentSources.mockResolvedValue([{
      id: 'p1', amount: 40000, tutorPayoutBase: 40000, viaWompi: true, chargedAt: new Date('2026-11-05T00:00:00Z'),
      excluded: false, tutorId: 't1', tutorPayoutStatus: 'paid', tutorPayoutAt: new Date('2026-11-10T00:00:00Z'),
      tutorPayoutAccountId: 'acc-bank', refundStatus: 'None',
    }]);
    repo.existingSourceKeys.mockResolvedValue(new Set(['SESSION_CHARGE:p1', 'WOMPI_FEE:Payment:p1']));

    const added = await service.syncLedger();

    const inserted = repo.insertProjectedEntries.mock.calls[0][0];
    expect(inserted.map((e) => e.sourceKey)).toEqual(['TUTOR_PAYOUT:p1', 'GMF:TUTOR_PAYOUT:p1']);
    expect(inserted[1].amount).toBe(136);
    expect(added).toBe(2);
  });
});

// ─── Manual entries ──────────────────────────────────────────────────────

describe('createManualEntry', () => {
  it('an expense from the bank adds its 4x1000', async () => {
    repo.findCategory.mockResolvedValue({ id: 'cat-1', name: 'Pauta' });
    const out = await service.createManualEntry({
      adminId: 'admin', kind: 'EXPENSE',
      data: { accountId: 'acc-bank', amount: 100000, effectiveAt: '2026-11-10T12:00:00Z', categoryId: 'cat-1', proofS3Key: PROOF },
    });
    expect(out.map((e) => [e.type, e.direction, e.amount])).toEqual([['EXPENSE', 'OUT', 100000], ['GMF', 'OUT', 400]]);
    const [expense, gmf] = repo.insertEntries.mock.calls[0][0];
    expect(gmf.sourceKey).toBe(`GMF:ENTRY:${expense.id}`);
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'FINANCE_ENTRY_CREATE' }));
  });

  it('an expense needs a category and a proof', async () => {
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'EXPENSE', data: { accountId: 'acc-cash', amount: 1000, proofS3Key: PROOF },
    })).rejects.toMatchObject({ rule: 'CATEGORY_REQUIRED' });
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'EXPENSE', data: { accountId: 'acc-cash', amount: 1000, categoryId: 'cat-1' },
    })).rejects.toMatchObject({ rule: 'PROOF_REQUIRED' });
    expect(repo.insertEntries).not.toHaveBeenCalled();
  });

  it('a transfer is a pair OUT / IN with one group (proof optional)', async () => {
    const out = await service.createManualEntry({
      adminId: 'admin', kind: 'TRANSFER', data: { accountId: 'acc-wompi', toAccountId: 'acc-bank', amount: 500000 },
    });
    expect(out.map((e) => [e.type, e.direction, e.account.id])).toEqual([
      ['TRANSFER', 'OUT', 'acc-wompi'], ['TRANSFER', 'IN', 'acc-bank'],
    ]);
    expect(out[0].transferGroupId).toBe(out[1].transferGroupId);
  });

  it('refuses a transfer to the same account', async () => {
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'TRANSFER', data: { accountId: 'acc-bank', toAccountId: 'acc-bank', amount: 1 },
    })).rejects.toMatchObject({ rule: 'SAME_ACCOUNT' });
  });

  it('the opening balance is dated at the cutoff', async () => {
    const [entry] = await service.createManualEntry({
      adminId: 'admin', kind: 'OPENING_BALANCE', data: { accountId: 'acc-bank', amount: 1200000, proofS3Key: PROOF },
    });
    expect(entry).toMatchObject({ type: 'OPENING_BALANCE', direction: 'IN', effectiveAt: CUTOFF });
  });

  it('refuses a date before the cutoff', async () => {
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'OTHER_INCOME', data: { accountId: 'acc-cash', amount: 1, effectiveAt: '2026-10-01T00:00:00Z', proofS3Key: PROOF },
    })).rejects.toMatchObject({ rule: 'DATE_BEFORE_CUTOFF' });
  });

  it('an adjustment needs a direction and a reason', async () => {
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'ADJUSTMENT', data: { accountId: 'acc-wompi', amount: 300, proofS3Key: PROOF, description: 'x' },
    })).rejects.toMatchObject({ rule: 'DIRECTION_REQUIRED' });
    await expect(service.createManualEntry({
      adminId: 'admin', kind: 'ADJUSTMENT', data: { accountId: 'acc-wompi', amount: 300, proofS3Key: PROOF, direction: 'OUT' },
    })).rejects.toMatchObject({ rule: 'REASON_REQUIRED' });
  });

  it('refuses everything until the ledger is configured', async () => {
    repo.getSettings.mockResolvedValue(null);
    await expect(service.createManualEntry({ adminId: 'admin', kind: 'EXPENSE', data: {} }))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});

describe('reverseEntry', () => {
  const expense = { id: 'e1', type: 'EXPENSE', direction: 'OUT', amount: '100000.00', accountId: 'acc-bank', reversedBy: null };

  it('reverses the entry and its 4x1000 together', async () => {
    repo.findEntry.mockResolvedValue(expense);
    repo.findLinkedEntries.mockResolvedValue([
      { id: 'g1', type: 'GMF', direction: 'OUT', amount: '400.00', accountId: 'acc-bank', reversedBy: null },
    ]);
    const out = await service.reverseEntry({ adminId: 'admin', id: 'e1', reason: 'registrado dos veces' });
    expect(out.map((e) => [e.type, e.direction, e.amount, e.reversesId])).toEqual([
      ['REVERSAL', 'IN', 100000, 'e1'], ['REVERSAL', 'IN', 400, 'g1'],
    ]);
  });

  it('needs a reason and refuses a second reversal', async () => {
    await expect(service.reverseEntry({ adminId: 'admin', id: 'e1', reason: ' ' })).rejects.toMatchObject({ rule: 'REASON_REQUIRED' });
    repo.findEntry.mockResolvedValue({ ...expense, reversedBy: { id: 'r1' } });
    await expect(service.reverseEntry({ adminId: 'admin', id: 'e1', reason: 'x' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

describe('updateSettings', () => {
  it('locks the cutoff once the ledger has entries', async () => {
    repo.countEntries.mockResolvedValue(3);
    await expect(service.updateSettings({ adminId: 'admin', data: { cutoffDate: '2026-10-01T05:00:00Z' } }))
      .rejects.toMatchObject({ code: 'CUTOFF_LOCKED' });
    expect(repo.upsertSettings).not.toHaveBeenCalled();
  });

  it('sets the cutoff while the ledger is empty', async () => {
    repo.countEntries.mockResolvedValue(0);
    repo.listCategories.mockResolvedValue([]);
    await service.updateSettings({ adminId: 'admin', data: { cutoffDate: '2026-10-01T05:00:00Z' } });
    expect(repo.upsertSettings).toHaveBeenCalledWith(expect.objectContaining({ cutoffDate: new Date('2026-10-01T05:00:00Z') }));
  });
});

// ─── Session refunds ─────────────────────────────────────────────────────

describe('refundSessionPayment', () => {
  const paid = { id: 'p1', status: 'paid', amount: '40000.00', refundStatus: 'None', tutorPayoutStatus: 'pending' };

  it('records a partial refund with its transfer', async () => {
    repo.findPaymentForRefund.mockResolvedValue(paid);
    repo.markSessionPaymentRefunded.mockResolvedValue(true);
    const out = await service.refundSessionPayment({
      adminId: 'admin', paymentId: 'p1', amount: 15000, accountId: 'acc-cash', reason: 'cancelada por el tutor', proofS3Key: PROOF,
    });
    expect(repo.markSessionPaymentRefunded).toHaveBeenCalledWith('p1', expect.objectContaining({
      refundAmount: 15000, refundAccountId: 'acc-cash', refundProofS3Key: PROOF, refundReason: 'cancelada por el tutor',
    }));
    expect(out).toEqual({ paymentId: 'p1', refundAmount: 15000, tutorAlreadyPaid: false });
  });

  it('never refunds more than was charged, twice, or without a reason', async () => {
    repo.findPaymentForRefund.mockResolvedValue(paid);
    await expect(service.refundSessionPayment({ adminId: 'a', paymentId: 'p1', amount: 50000, reason: 'x', proofS3Key: PROOF }))
      .rejects.toMatchObject({ rule: 'AMOUNT_OVER_CHARGE' });
    await expect(service.refundSessionPayment({ adminId: 'a', paymentId: 'p1', reason: '', proofS3Key: PROOF }))
      .rejects.toMatchObject({ rule: 'REASON_REQUIRED' });
    repo.findPaymentForRefund.mockResolvedValue({ ...paid, refundStatus: 'Refunded' });
    await expect(service.refundSessionPayment({ adminId: 'a', paymentId: 'p1', reason: 'x', proofS3Key: PROOF }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────

describe('getSummary', () => {
  it('cash per account, what is owed, what is available and the profit', async () => {
    repo.sumsByAccount.mockResolvedValue([
      { accountId: 'acc-bank', direction: 'IN', _sum: { amount: '1000000' } },
      { accountId: 'acc-bank', direction: 'OUT', _sum: { amount: '100400' } },
      { accountId: 'acc-wompi', direction: 'IN', _sum: { amount: '40000' } },
      { accountId: 'acc-wompi', direction: 'OUT', _sum: { amount: '2094.40' } },
    ]);
    repo.pendingTutorShares.mockResolvedValue([
      { tutorPayoutBase: 40000, happened: true },
      { tutorPayoutBase: 20000, happened: false },
    ]);
    // "Por pagar" = what the payouts page says is left to transfer.
    payouts.listPendingPayoutsByTutor.mockResolvedValue({ totals: { tutorOwed: 34000 } });
    payouts.listEventPayouts.mockResolvedValue({ totalOwed: 240000, events: [] });
    repo.pendingEventRefunds.mockResolvedValue(36000);
    repo.heldSessionPayments.mockResolvedValue([
      { amount: 40000, tutorPayoutBase: 40000, viaWompi: true, refunded: 0 },
    ]);
    repo.profitEntries.mockResolvedValue([
      { type: 'EXPENSE', direction: 'OUT', amount: '100000', category: { name: 'Pauta' } },
      { type: 'GMF', direction: 'OUT', amount: '400' },
    ]);
    eventFinance.mockResolvedValue({
      tutorsOwed: 999999, // not used for "por pagar": the payouts page is the source
      earnings: { events: 1, collected: 380000, tutorPayout: 240000, wompiFees: 0, calicoNet: 140000 },
    });

    const out = await service.getSummary();

    expect(out.accounts.find((a) => a.id === 'acc-bank').balance).toBe(899600);
    expect(out.cash).toBeCloseTo(899600 + 37905.6, 2);
    expect(out.owed).toEqual({ sessions: 34000, events: 240000, total: 274000, upcomingSessions: 17000, pendingRefunds: 36000 });
    expect(out.available).toBeCloseTo(out.cash - 274000 - 17000 - 36000, 2);

    const p = out.profit.period;
    expect(p.sessions.net).toBeCloseTo(3905.6, 1); // 6 000 − Wompi 2 094.40
    expect(p.events.net).toBe(140000);
    expect(p.expenses).toBe(100000);
    expect(p.gmf).toBe(400);
    expect(p.expensesByCategory).toEqual([{ name: 'Pauta', amount: 100000 }]);
    expect(p.total).toBeCloseTo(3905.6 + 140000 - 100400, 1);
    expect(p.eventsTutorsOwed).toBeUndefined();
  });

  it('asks to configure the ledger first', async () => {
    repo.getSettings.mockResolvedValue(null);
    await expect(service.getSummary()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
