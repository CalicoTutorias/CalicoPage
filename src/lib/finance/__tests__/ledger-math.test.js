import {
  balancesByAccount,
  eventPaymentEntries,
  eventTutorPayoutEntries,
  gmfEntryFor,
  gmfOf,
  ledgerProfitItems,
  manualEventChargeEntries,
  reversalOf,
  sessionPaymentEntries,
  withGmf,
} from '../ledger-math';
import { wompiFee } from '../../payments/fees';

const CUTOFF = new Date('2026-11-01T05:00:00Z');
const ACCOUNTS = { wompi: 'acc-wompi', bank: 'acc-bank', manual: 'acc-bank' };
const ctx = { cutoff: CUTOFF, accounts: ACCOUNTS };
const accountsById = new Map([
  ['acc-wompi', { id: 'acc-wompi', gmfApplies: false }],
  ['acc-bank', { id: 'acc-bank', gmfApplies: true }],
  ['acc-cash', { id: 'acc-cash', gmfApplies: false }],
]);

const session = (over = {}) => ({
  id: 'p1',
  amount: 40000,
  tutorPayoutBase: 40000,
  viaWompi: true,
  chargedAt: new Date('2026-11-05T15:00:00Z'),
  excluded: false,
  tutorId: 't1',
  tutorPayoutStatus: 'pending',
  tutorPayoutAt: null,
  tutorPayoutAccountId: null,
  refundStatus: 'None',
  refundAmount: null,
  refundedAt: null,
  refundAccountId: null,
  ...over,
});

describe('gmfOf / gmfEntryFor', () => {
  it('is 0.4 % of the outflow', () => {
    expect(gmfOf(34000)).toBe(136);
    expect(gmfOf(34000, 0.004)).toBe(136);
  });

  it('only outflows of accounts with 4x1000 cause it', () => {
    const out = { type: 'TUTOR_PAYOUT', direction: 'OUT', amount: 34000, accountId: 'acc-bank', effectiveAt: CUTOFF, sourceKey: 'TUTOR_PAYOUT:p1' };
    expect(gmfEntryFor(out, { account: accountsById.get('acc-bank'), rate: 0.004 })).toMatchObject({
      type: 'GMF', direction: 'OUT', amount: 136, sourceKey: 'GMF:TUTOR_PAYOUT:p1', isEstimate: true,
    });
    expect(gmfEntryFor(out, { account: accountsById.get('acc-wompi'), rate: 0.004 })).toBeNull();
    expect(gmfEntryFor({ ...out, direction: 'IN' }, { account: accountsById.get('acc-bank'), rate: 0.004 })).toBeNull();
    expect(gmfEntryFor({ ...out, type: 'GMF' }, { account: accountsById.get('acc-bank'), rate: 0.004 })).toBeNull();
  });

  it('keys the GMF of a manual entry on its id', () => {
    const e = { id: 'e9', type: 'EXPENSE', direction: 'OUT', amount: 100000, accountId: 'acc-bank', effectiveAt: CUTOFF };
    expect(gmfEntryFor(e, { account: accountsById.get('acc-bank'), rate: 0.004 }).sourceKey).toBe('GMF:ENTRY:e9');
  });
});

describe('sessionPaymentEntries', () => {
  it('a Wompi charge: the charge in WOMPI and its estimated fee', () => {
    const entries = sessionPaymentEntries(session(), ctx);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: 'SESSION_CHARGE', direction: 'IN', amount: 40000, accountId: 'acc-wompi', sourceKey: 'SESSION_CHARGE:p1' });
    expect(entries[1]).toMatchObject({
      type: 'WOMPI_FEE', direction: 'OUT', amount: Math.round(wompiFee(40000) * 100) / 100, accountId: 'acc-wompi', isEstimate: true,
    });
  });

  it('a manual charge goes to the manual account, without a fee', () => {
    const entries = sessionPaymentEntries(session({ viaWompi: false }), ctx);
    expect(entries).toEqual([expect.objectContaining({ type: 'SESSION_CHARGE', accountId: 'acc-bank' })]);
  });

  it('the transfer to the tutor is 85 % of the payout base, from the account used', () => {
    const entries = sessionPaymentEntries(session({
      chargedAt: new Date('2026-10-20T00:00:00Z'), // charged before the cutoff: not in the ledger
      tutorPayoutStatus: 'paid', tutorPayoutAt: new Date('2026-11-08T00:00:00Z'), tutorPayoutAccountId: 'acc-cash',
    }), ctx);
    expect(entries).toEqual([expect.objectContaining({
      type: 'TUTOR_PAYOUT', direction: 'OUT', amount: 34000, accountId: 'acc-cash', tutorId: 't1', sourceKey: 'TUTOR_PAYOUT:p1',
    })]);
  });

  it('a coupon Calico absorbs still pays the tutor 85 % of the list price', () => {
    const entries = sessionPaymentEntries(session({
      amount: 30000, tutorPayoutBase: 40000, tutorPayoutStatus: 'paid', tutorPayoutAt: new Date('2026-11-08T00:00:00Z'),
    }), ctx);
    expect(entries.find((e) => e.type === 'TUTOR_PAYOUT').amount).toBe(34000);
  });

  it('a refund leaves the refund account (all or the partial amount)', () => {
    const full = sessionPaymentEntries(session({ refundStatus: 'Refunded', refundedAt: new Date('2026-11-09T00:00:00Z') }), ctx);
    expect(full.find((e) => e.type === 'REFUND')).toMatchObject({ amount: 40000, accountId: 'acc-bank', direction: 'OUT' });
    const part = sessionPaymentEntries(session({ refundStatus: 'Refunded', refundAmount: 15000, refundedAt: new Date('2026-11-09T00:00:00Z') }), ctx);
    expect(part.find((e) => e.type === 'REFUND').amount).toBe(15000);
  });

  it('nothing before the cutoff enters the ledger', () => {
    expect(sessionPaymentEntries(session({ chargedAt: new Date('2026-10-01T00:00:00Z') }), ctx)).toEqual([]);
  });

  it('test-course money enters cash but is flagged out of the profit', () => {
    const entries = sessionPaymentEntries(session({ excluded: true }), ctx);
    expect(entries.every((e) => e.excludeFromProfit)).toBe(true);
  });
});

describe('event entries', () => {
  it('a Wompi charge of a repaso and its fee', () => {
    const entries = eventPaymentEntries({ id: 'ep1', amount: 36000, createdAt: new Date('2026-11-03T00:00:00Z') }, ctx);
    expect(entries.map((e) => e.type)).toEqual(['EVENT_CHARGE', 'WOMPI_FEE']);
    expect(entries[0].sourceKey).toBe('EVENT_CHARGE:EventPayment:ep1');
  });

  it('a refunded repaso charge adds the refund', () => {
    const entries = eventPaymentEntries({
      id: 'ep1', amount: 36000, createdAt: new Date('2026-11-03T00:00:00Z'),
      refundStatus: 'Refunded', refundAmount: 20000, refundedAt: new Date('2026-11-04T00:00:00Z'), refundAccountId: 'acc-cash',
    }, ctx);
    expect(entries[2]).toMatchObject({ type: 'REFUND', amount: 20000, accountId: 'acc-cash' });
  });

  it('a manual repaso registration is a charge in the manual account', () => {
    expect(manualEventChargeEntries({ id: 'r1', amount: 40000, confirmedAt: new Date('2026-11-03T00:00:00Z') }, ctx))
      .toEqual([expect.objectContaining({ type: 'EVENT_CHARGE', accountId: 'acc-bank', sourceKey: 'EVENT_CHARGE:EventRegistration:r1' })]);
  });

  it('a repaso tutor payout leaves the account used (bank by default)', () => {
    expect(eventTutorPayoutEntries({ id: 'x1', amount: 240000, paidAt: new Date('2026-11-10T00:00:00Z'), tutorId: 't1' }, ctx))
      .toEqual([expect.objectContaining({ type: 'EVENT_TUTOR_PAYOUT', amount: 240000, accountId: 'acc-bank', tutorId: 't1' })]);
  });
});

describe('withGmf + balancesByAccount', () => {
  it('adds the 4x1000 of bank outflows and balances the accounts', () => {
    const entries = withGmf([
      ...sessionPaymentEntries(session({ tutorPayoutStatus: 'paid', tutorPayoutAt: new Date('2026-11-08T00:00:00Z') }), ctx),
      { type: 'TRANSFER', direction: 'IN', amount: 37906, accountId: 'acc-bank', effectiveAt: CUTOFF },
      { type: 'TRANSFER', direction: 'OUT', amount: 37906, accountId: 'acc-wompi', effectiveAt: CUTOFF },
    ], { accountsById, rate: 0.004 });
    const gmf = entries.filter((e) => e.type === 'GMF');
    expect(gmf).toEqual([expect.objectContaining({ amount: 136, accountId: 'acc-bank', sourceKey: 'GMF:TUTOR_PAYOUT:p1' })]);

    const balances = balancesByAccount(entries);
    const fee = Math.round(wompiFee(40000) * 100) / 100;
    expect(balances.get('acc-wompi')).toBeCloseTo(40000 - fee - 37906, 2);
    expect(balances.get('acc-bank')).toBeCloseTo(37906 - 34000 - 136, 2);
  });
});

describe('ledgerProfitItems', () => {
  it('counts GMF, expenses, other income and adjustments; reversals undo their original', () => {
    const items = ledgerProfitItems([
      { type: 'GMF', direction: 'OUT', amount: 136 },
      { type: 'EXPENSE', direction: 'OUT', amount: 100000 },
      { type: 'REVERSAL', direction: 'IN', amount: 100000, reverses: { type: 'EXPENSE' } },
      { type: 'EXPENSE', direction: 'OUT', amount: 50000 },
      { type: 'OTHER_INCOME', direction: 'IN', amount: 20000 },
      { type: 'OTHER_INCOME', direction: 'IN', amount: 999999, excludeFromProfit: true }, // capital contribution
      { type: 'ADJUSTMENT', direction: 'OUT', amount: 300 },
    ]);
    expect(items).toEqual({ gmf: -136, expenses: -50000, otherIncome: 20000, adjustments: -300, total: -30436 });
  });
});

describe('reversalOf', () => {
  it('is the opposite entry on the same account', () => {
    const r = reversalOf(
      { id: 'e1', type: 'EXPENSE', direction: 'OUT', amount: '100000.00', accountId: 'acc-bank' },
      { effectiveAt: CUTOFF, description: 'duplicado', createdById: 'admin' },
    );
    expect(r).toMatchObject({ type: 'REVERSAL', direction: 'IN', amount: 100000, accountId: 'acc-bank', reversesId: 'e1', sourceKey: null });
  });
});
