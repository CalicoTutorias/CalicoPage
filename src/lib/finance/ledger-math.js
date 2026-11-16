/**
 * Pure rules of Calico's ledger (libro de movimientos). No Prisma, no I/O:
 * the service feeds it source rows and settings, and writes what it returns.
 *
 * Money model (docs/specs/finance-ledger.md):
 *   - Every entry is real money entering (IN) or leaving (OUT) one account.
 *     `amount` is always positive.
 *   - Automatic entries are PROJECTED from the rows that already describe the
 *     money (payments, event payments, tutor payouts, refunds). Each carries a
 *     unique `sourceKey`, so projecting twice never duplicates.
 *   - Wompi fees and the 4x1000 (GMF) are estimates (`isEstimate`); the
 *     monthly reconciliation fixes them with an ADJUSTMENT.
 *   - The GMF is caused by money LEAVING an account whose `gmfApplies` is on.
 *
 * Fee math lives in src/lib/payments/fees.js — never re-implemented here.
 */

import { tutorPayout, wompiFee } from '../payments/fees';

export const ENTRY_TYPES = Object.freeze({
  OPENING_BALANCE: 'OPENING_BALANCE',
  SESSION_CHARGE: 'SESSION_CHARGE',
  EVENT_CHARGE: 'EVENT_CHARGE',
  WOMPI_FEE: 'WOMPI_FEE',
  TUTOR_PAYOUT: 'TUTOR_PAYOUT',
  EVENT_TUTOR_PAYOUT: 'EVENT_TUTOR_PAYOUT',
  GMF: 'GMF',
  REFUND: 'REFUND',
  TRANSFER: 'TRANSFER',
  EXPENSE: 'EXPENSE',
  OTHER_INCOME: 'OTHER_INCOME',
  ADJUSTMENT: 'ADJUSTMENT',
  REVERSAL: 'REVERSAL',
});

/** Entries an admin types in (the rest are projected). */
export const MANUAL_ENTRY_KINDS = Object.freeze([
  'OPENING_BALANCE', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT', 'TRANSFER',
]);

/** Manual kinds that need a proof (spec §8). Transfers between own accounts do not. */
export const PROOF_REQUIRED_KINDS = Object.freeze(['OPENING_BALANCE', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT']);

/**
 * Types that count in the period's profit straight from the ledger. Charges,
 * Wompi fees and tutor payouts are not here: the profit takes them from the
 * fee rules on held sessions / repasos (recognised when they happen), so the
 * ledger only adds what those rules do not know about.
 */
export const PROFIT_LEDGER_TYPES = Object.freeze(['GMF', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT']);

export const DEFAULT_GMF_RATE = 0.004;

const toNumber = (v) => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Pesos with two decimals, as stored (DECIMAL(12,2)). */
export const money = (v) => Math.round(toNumber(v) * 100) / 100;

/** +amount for IN, −amount for OUT. */
export const signed = (entry) => (entry.direction === 'IN' ? 1 : -1) * toNumber(entry.amount);

/** GMF of an outflow of `amount` at `rate` (0.4 % by default). */
export function gmfOf(amount, rate = DEFAULT_GMF_RATE) {
  return money(toNumber(amount) * toNumber(rate));
}

/**
 * The GMF entry an OUT entry causes, or null (inflows, exempt accounts,
 * GMF of a GMF). Keyed on the parent so it is created once.
 */
export function gmfEntryFor(parent, { account, rate }) {
  if (!parent || parent.direction !== 'OUT') return null;
  if (!account?.gmfApplies) return null;
  if (parent.type === ENTRY_TYPES.GMF) return null;
  const amount = gmfOf(parent.amount, rate);
  if (amount <= 0) return null;
  const parentRef = parent.sourceKey ?? `ENTRY:${parent.id}`;
  return {
    type: ENTRY_TYPES.GMF,
    direction: 'OUT',
    amount,
    accountId: parent.accountId,
    effectiveAt: parent.effectiveAt,
    sourceKey: `GMF:${parentRef}`,
    sourceType: 'GMF',
    sourceId: parent.sourceId ?? parent.id ?? null,
    isEstimate: true,
    excludeFromProfit: Boolean(parent.excludeFromProfit),
    tutorId: parent.tutorId ?? null,
    description: null,
  };
}

const auto = (fields) => ({
  proofS3Key: null,
  isEstimate: false,
  excludeFromProfit: false,
  tutorId: null,
  description: null,
  ...fields,
});

/**
 * Projected entries of one session payment row:
 *   { id, amount, tutorPayoutBase, viaWompi, chargedAt, excluded,
 *     tutorId, tutorPayoutStatus, tutorPayoutAt, tutorPayoutAccountId,
 *     refundStatus, refundAmount, refundedAt, refundAccountId }
 * Only events on/after `cutoff` produce entries.
 */
export function sessionPaymentEntries(row, { cutoff, accounts }) {
  const out = [];
  const at = (d) => d && new Date(d) >= cutoff;
  const amount = money(row.amount);
  const excluded = Boolean(row.excluded);

  if (amount > 0 && at(row.chargedAt)) {
    const accountId = row.viaWompi ? accounts.wompi : accounts.manual;
    out.push(auto({
      type: ENTRY_TYPES.SESSION_CHARGE, direction: 'IN', amount, accountId,
      effectiveAt: new Date(row.chargedAt), sourceKey: `SESSION_CHARGE:${row.id}`,
      sourceType: 'Payment', sourceId: row.id, excludeFromProfit: excluded, tutorId: row.tutorId,
    }));
    if (row.viaWompi) {
      out.push(auto({
        type: ENTRY_TYPES.WOMPI_FEE, direction: 'OUT', amount: money(wompiFee(amount)), accountId: accounts.wompi,
        effectiveAt: new Date(row.chargedAt), sourceKey: `WOMPI_FEE:Payment:${row.id}`,
        sourceType: 'Payment', sourceId: row.id, isEstimate: true, excludeFromProfit: excluded,
      }));
    }
  }

  if (row.tutorPayoutStatus === 'paid' && at(row.tutorPayoutAt)) {
    const owed = money(tutorPayout(row.tutorPayoutBase ?? row.amount));
    if (owed > 0) {
      out.push(auto({
        type: ENTRY_TYPES.TUTOR_PAYOUT, direction: 'OUT', amount: owed,
        accountId: row.tutorPayoutAccountId ?? accounts.bank,
        effectiveAt: new Date(row.tutorPayoutAt), sourceKey: `TUTOR_PAYOUT:${row.id}`,
        sourceType: 'Payment', sourceId: row.id, excludeFromProfit: excluded, tutorId: row.tutorId,
        proofS3Key: row.tutorPayoutProofS3Key ?? null,
      }));
    }
  }

  if (row.refundStatus === 'Refunded' && at(row.refundedAt)) {
    const refunded = money(row.refundAmount ?? row.amount);
    if (refunded > 0) {
      out.push(auto({
        type: ENTRY_TYPES.REFUND, direction: 'OUT', amount: refunded,
        accountId: row.refundAccountId ?? accounts.bank,
        effectiveAt: new Date(row.refundedAt), sourceKey: `REFUND:Payment:${row.id}`,
        sourceType: 'Payment', sourceId: row.id, excludeFromProfit: excluded,
        proofS3Key: row.refundProofS3Key ?? null,
      }));
    }
  }
  return out;
}

/**
 * Projected entries of one Wompi charge of a repaso:
 *   { id, amount, createdAt, excluded, refundStatus, refundAmount, refundedAt, refundAccountId }
 */
export function eventPaymentEntries(row, { cutoff, accounts }) {
  const out = [];
  const at = (d) => d && new Date(d) >= cutoff;
  const amount = money(row.amount);
  const excluded = Boolean(row.excluded);

  if (amount > 0 && at(row.createdAt)) {
    out.push(auto({
      type: ENTRY_TYPES.EVENT_CHARGE, direction: 'IN', amount, accountId: accounts.wompi,
      effectiveAt: new Date(row.createdAt), sourceKey: `EVENT_CHARGE:EventPayment:${row.id}`,
      sourceType: 'EventPayment', sourceId: row.id, excludeFromProfit: excluded,
    }));
    out.push(auto({
      type: ENTRY_TYPES.WOMPI_FEE, direction: 'OUT', amount: money(wompiFee(amount)), accountId: accounts.wompi,
      effectiveAt: new Date(row.createdAt), sourceKey: `WOMPI_FEE:EventPayment:${row.id}`,
      sourceType: 'EventPayment', sourceId: row.id, isEstimate: true, excludeFromProfit: excluded,
    }));
  }

  if (row.refundStatus === 'Refunded' && at(row.refundedAt)) {
    const refunded = money(row.refundAmount ?? row.amount);
    if (refunded > 0) {
      out.push(auto({
        type: ENTRY_TYPES.REFUND, direction: 'OUT', amount: refunded,
        accountId: row.refundAccountId ?? accounts.bank,
        effectiveAt: new Date(row.refundedAt), sourceKey: `REFUND:EventPayment:${row.id}`,
        sourceType: 'EventPayment', sourceId: row.id, excludeFromProfit: excluded,
        proofS3Key: row.refundProofS3Key ?? null,
      }));
    }
  }
  return out;
}

/** A confirmed registration of a manual (approval) repaso: { id, amount, confirmedAt, excluded }. */
export function manualEventChargeEntries(row, { cutoff, accounts }) {
  const amount = money(row.amount);
  if (amount <= 0 || !row.confirmedAt || new Date(row.confirmedAt) < cutoff) return [];
  return [auto({
    type: ENTRY_TYPES.EVENT_CHARGE, direction: 'IN', amount, accountId: accounts.manual,
    effectiveAt: new Date(row.confirmedAt), sourceKey: `EVENT_CHARGE:EventRegistration:${row.id}`,
    sourceType: 'EventRegistration', sourceId: row.id, excludeFromProfit: Boolean(row.excluded),
  })];
}

/** One EventTutorPayout: { id, amount, paidAt, accountId, tutorId, excluded }. */
export function eventTutorPayoutEntries(row, { cutoff, accounts }) {
  const amount = money(row.amount);
  if (amount <= 0 || !row.paidAt || new Date(row.paidAt) < cutoff) return [];
  return [auto({
    type: ENTRY_TYPES.EVENT_TUTOR_PAYOUT, direction: 'OUT', amount,
    accountId: row.accountId ?? accounts.bank,
    effectiveAt: new Date(row.paidAt), sourceKey: `EVENT_TUTOR_PAYOUT:${row.id}`,
    sourceType: 'EventTutorPayout', sourceId: row.id, excludeFromProfit: Boolean(row.excluded), tutorId: row.tutorId,
    proofS3Key: row.proofS3Key ?? null,
  })];
}

/** Adds the GMF entry of every outflow that causes one. */
export function withGmf(entries, { accountsById, rate }) {
  const out = [];
  for (const e of entries) {
    out.push(e);
    const gmf = gmfEntryFor(e, { account: accountsById.get(e.accountId), rate });
    if (gmf) out.push(gmf);
  }
  return out;
}

/**
 * Balance per account: Σ IN − Σ OUT.
 * @returns {Map<string, number>}
 */
export function balancesByAccount(entries) {
  const map = new Map();
  for (const e of entries) map.set(e.accountId, money((map.get(e.accountId) ?? 0) + signed(e)));
  return map;
}

/**
 * The type an entry counts as in the profit: a REVERSAL counts as the type it
 * reverses (with the opposite sign, which its own direction already carries).
 */
export function profitTypeOf(entry) {
  return entry.type === ENTRY_TYPES.REVERSAL ? entry.reverses?.type ?? null : entry.type;
}

/**
 * What the ledger adds to the profit of a period: GMF, expenses, other
 * income and adjustments (and the reversals of those). Entries flagged
 * `excludeFromProfit` (test courses, capital contributions) stay out.
 * @returns {{ gmf: number, expenses: number, otherIncome: number, adjustments: number, total: number }}
 */
export function ledgerProfitItems(entries) {
  const totals = { gmf: 0, expenses: 0, otherIncome: 0, adjustments: 0 };
  const key = { GMF: 'gmf', EXPENSE: 'expenses', OTHER_INCOME: 'otherIncome', ADJUSTMENT: 'adjustments' };
  for (const e of entries) {
    if (e.excludeFromProfit) continue;
    const k = key[profitTypeOf(e)];
    if (!k) continue;
    totals[k] = money(totals[k] + signed(e));
  }
  return { ...totals, total: money(totals.gmf + totals.expenses + totals.otherIncome + totals.adjustments) };
}

/** The opposite entry of `entry` (same account, amount and date of the reversal). */
export function reversalOf(entry, { effectiveAt, description, createdById }) {
  return {
    type: ENTRY_TYPES.REVERSAL,
    direction: entry.direction === 'IN' ? 'OUT' : 'IN',
    amount: money(entry.amount),
    accountId: entry.accountId,
    effectiveAt,
    reversesId: entry.id,
    excludeFromProfit: Boolean(entry.excludeFromProfit),
    tutorId: entry.tutorId ?? null,
    transferGroupId: entry.transferGroupId ?? null,
    description,
    createdById,
    sourceKey: null,
    isEstimate: false,
  };
}
