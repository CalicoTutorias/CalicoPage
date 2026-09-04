/**
 * Fee math for Calico payments.
 *
 * Pricing model:
 *   - Calico's commission: 15% of the gross amount.
 *   - Wompi (payment gateway) charges 2.65% + $700 + IVA per transaction.
 *     IVA in Colombia = 19% on the fee subtotal.
 *   - The tutor receives 85% of the gross amount, regardless of the Wompi fee.
 *   - Calico's NET earning = 15% × gross − wompiFee.
 *
 * For very small transactions Calico's net can still go negative (the
 * fixed $700 + IVA component of Wompi dominates). The dashboard surfaces
 * this honestly so admins can avoid pricing courses too low; we don't
 * clamp at zero.
 *
 * Single source of truth: any code that needs to compute the tutor's
 * share or Calico's net MUST import the helpers below — never re-implement
 * `* 0.15` or `* 0.85` inline.
 *
 * All inputs/outputs are JS Numbers in COP (centavos NOT used). Inputs may
 * arrive as strings or Decimals from Prisma — `toNumber()` normalises.
 */

export const CALICO_COMMISSION_RATE = 0.15;     // 15%
export const TUTOR_SHARE_RATE       = 0.85;     // 1 - CALICO_COMMISSION_RATE
export const WOMPI_PERCENT          = 0.0265;   // 2.65%
export const WOMPI_FIXED_COP        = 700;      // $700 fixed component
export const IVA_RATE               = 0.19;     // 19% Colombia IVA

/**
 * Smallest amount Wompi accepts per transaction (aggregator model, COP).
 * Coupons are capped so the final charge never drops below this — see
 * `coupon-math.js`. Source: Wompi help center, "monto mínimo para realizar
 * una transacción".
 */
export const MIN_CHARGE_COP         = 1500;

/**
 * Discounted payments split one gross number into four (see the Payment
 * model): `amount` (charged), `originalAmount` (list price),
 * `discountAmount` and `tutorPayoutBase`. The Wompi fee is charged on
 * `amount`; the tutor's share is computed on `tutorPayoutBase`, which is
 * the list price when Calico absorbs the discount and the charged amount
 * when the discount is shared with the tutor. Every aggregate below accepts
 * either plain amounts (legacy rows, no coupon) or those four fields.
 */

/**
 * Pretty-printed commission percentage for UI copy (e.g. "15%").
 * Reading from this avoids stale strings drifting away from the constant
 * if the rate ever changes again.
 */
export const CALICO_COMMISSION_PCT = `${Math.round(CALICO_COMMISSION_RATE * 100)}%`;
export const TUTOR_SHARE_PCT       = `${Math.round(TUTOR_SHARE_RATE * 100)}%`;

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  // Handles Prisma Decimal (toString) and plain strings.
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Total Wompi fee for a transaction of `amount` COP, including IVA.
 */
export function wompiFee(amount) {
  const gross = toNumber(amount);
  const subtotal = gross * WOMPI_PERCENT + WOMPI_FIXED_COP;
  return subtotal * (1 + IVA_RATE);
}

/**
 * Calico's net earning for one transaction (can be negative on tiny amounts).
 */
export function calicoNet(amount) {
  const gross = toNumber(amount);
  return gross * CALICO_COMMISSION_RATE - wompiFee(gross);
}

/**
 * What the tutor is owed for one transaction (85% of gross). Independent
 * of the Wompi fee — Calico absorbs the gateway cost out of its own
 * commission.
 */
export function tutorPayout(amount) {
  return toNumber(amount) * TUTOR_SHARE_RATE;
}

/**
 * Normalise one payment row (or a bare amount) into the four money fields.
 * Missing breakdown fields default to the no-coupon case so legacy callers
 * that pass plain numbers keep working unchanged.
 */
function normalizeRow(row) {
  if (row != null && typeof row === 'object') {
    const amount          = toNumber(row.amount);
    const originalAmount  = row.originalAmount  == null ? amount : toNumber(row.originalAmount);
    const tutorPayoutBase = row.tutorPayoutBase == null ? amount : toNumber(row.tutorPayoutBase);
    const discountAmount  = row.discountAmount  == null
      ? Math.max(0, originalAmount - amount)
      : toNumber(row.discountAmount);
    return { amount, originalAmount, tutorPayoutBase, discountAmount };
  }
  const amount = toNumber(row);
  return { amount, originalAmount: amount, tutorPayoutBase: amount, discountAmount: 0 };
}

/** Part of a row's discount that Calico ate by keeping the tutor whole. */
function discountAbsorbedByCalico({ amount, tutorPayoutBase, discountAmount }) {
  return Math.max(0, Math.min(discountAmount, tutorPayoutBase - amount));
}

function finalizeAggregate({ gross, listGross, tutorBase, discount, discountCalico, fees, count }) {
  const owed = tutorPayout(tutorBase);
  const net  = gross - owed - fees;
  return {
    gross,
    listGross:       Number(listGross.toFixed(2)),
    discountTotal:   Number(discount.toFixed(2)),
    discountCalico:  Number(discountCalico.toFixed(2)),
    discountShared:  Number((discount - discountCalico).toFixed(2)),
    calicoNet:       Number(net.toFixed(2)),
    tutorPayout:     Number(owed.toFixed(2)),
    wompiFeeTotal:   Number(fees.toFixed(2)),
    effectiveMargin: gross > 0 ? net / gross : 0,
    paymentsCount:   count,
  };
}

/**
 * Aggregate breakdown for arrays of payments, useful for the dashboard KPIs.
 * Accepts bare amounts or rows `{ amount, originalAmount, discountAmount,
 * tutorPayoutBase }`. Returns gross (charged), listGross, discount totals
 * (split by who absorbed them), calicoNet, tutorPayout, the Wompi fee total
 * and the implied effective margin.
 */
export function aggregateFinancials(rows = []) {
  let gross = 0;
  let listGross = 0;
  let tutorBase = 0;
  let discount = 0;
  let discountCalico = 0;
  let fees = 0;
  let count = 0;
  for (const r of rows) {
    const p = normalizeRow(r);
    gross          += p.amount;
    listGross      += p.originalAmount;
    tutorBase      += p.tutorPayoutBase;
    discount       += p.discountAmount;
    discountCalico += discountAbsorbedByCalico(p);
    fees           += wompiFee(p.amount);
    count          += 1;
  }
  return finalizeAggregate({ gross, listGross, tutorBase, discount, discountCalico, fees, count });
}

/**
 * Per-payment breakdown: what the tutor is owed, the Wompi fee and Calico's
 * net for ONE payment row, plus who absorbed its discount (null without one).
 */
export function paymentBreakdown(payment) {
  const p    = normalizeRow(payment);
  const fee  = wompiFee(p.amount);
  const owed = tutorPayout(p.tutorPayoutBase);
  const net  = p.amount - owed - fee;
  let discountAbsorber = null;
  if (p.discountAmount > 0) {
    discountAbsorber = p.tutorPayoutBase > p.amount ? 'CALICO' : 'SHARED';
  }
  return {
    amount:          p.amount,
    originalAmount:  p.originalAmount,
    discountAmount:  p.discountAmount,
    tutorPayoutBase: p.tutorPayoutBase,
    tutorOwed:       Number(owed.toFixed(2)),
    wompiFee:        Number(fee.toFixed(2)),
    calicoNet:       Number(net.toFixed(2)),
    discountAbsorber,
  };
}

/**
 * Exact aggregate breakdown from a group's gross total and transaction
 * count — without needing the individual amounts.
 *
 * The Wompi fee is linear in (gross, count):
 *   Σ wompiFee = (WOMPI_PERCENT·gross + WOMPI_FIXED_COP·count) · (1 + IVA_RATE)
 * so SUM(amount) + COUNT(*) from a SQL GROUP BY are enough to compute the
 * exact Calico net. Prefer this over `aggregateFinancials` whenever the DB
 * already aggregated the rows (per-course/per-month series), so we don't
 * have to ship every amount back to Node. Same return shape as
 * `aggregateFinancials`.
 *
 * @param {{ gross?: number|string, count?: number|string }} totals
 */
export function aggregateFinancialsFromTotals({
  gross = 0,
  count = 0,
  tutorBase,       // SUM(tutor_payout_base); defaults to gross (no coupons)
  listGross,       // SUM(original_amount);   defaults to gross (no coupons)
  discountCalico,  // SUM(tutor_payout_base − amount); derived when omitted
} = {}) {
  const g    = toNumber(gross);
  const n    = toNumber(count);
  const base = tutorBase == null ? g : toNumber(tutorBase);
  const list = listGross == null ? g : toNumber(listGross);
  const discount = Math.max(0, list - g);
  const dCalico  = discountCalico == null
    ? Math.max(0, Math.min(discount, base - g))
    : toNumber(discountCalico);
  const fees = (g * WOMPI_PERCENT + WOMPI_FIXED_COP * n) * (1 + IVA_RATE);
  return finalizeAggregate({
    gross: g, listGross: list, tutorBase: base, discount, discountCalico: dCalico, fees, count: n,
  });
}

/**
 * Minimum gross price at which Calico's net on a single transaction stops
 * being negative (break-even). Below this, the fixed $700 + IVA Wompi
 * component eats the whole commission. Used by the admin profitability
 * view to flag courses priced too low.
 *
 *   0 = CALICO_COMMISSION_RATE·p − (WOMPI_PERCENT·p + WOMPI_FIXED_COP)·(1 + IVA_RATE)
 *
 * @returns {number} break-even price in COP (≈ 7 032 at current rates)
 */
export function breakEvenPrice() {
  const fixed = WOMPI_FIXED_COP * (1 + IVA_RATE);
  const rate  = CALICO_COMMISSION_RATE - WOMPI_PERCENT * (1 + IVA_RATE);
  return rate > 0 ? fixed / rate : Infinity;
}
