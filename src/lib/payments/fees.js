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
 * Pretty-printed commission percentage for UI copy (e.g. "20%").
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
 * What the tutor is owed for one transaction (80% of gross). Independent
 * of the Wompi fee — Calico absorbs the gateway cost out of its own
 * commission.
 */
export function tutorPayout(amount) {
  return toNumber(amount) * TUTOR_SHARE_RATE;
}

/**
 * Aggregate breakdown for arrays of payment amounts, useful for the
 * dashboard KPIs. Returns gross, calicoNet, tutorPayout and the implied
 * effective margin.
 */
export function aggregateFinancials(amounts = []) {
  let gross = 0;
  let net   = 0;
  let owed  = 0;
  for (const a of amounts) {
    const x = toNumber(a);
    gross += x;
    net   += calicoNet(x);
    owed  += tutorPayout(x);
  }
  return {
    gross,
    calicoNet:    Number(net.toFixed(2)),
    tutorPayout:  Number(owed.toFixed(2)),
    wompiFeeTotal: Number((gross - net - owed).toFixed(2)),
    effectiveMargin: gross > 0 ? net / gross : 0,
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
export function aggregateFinancialsFromTotals({ gross = 0, count = 0 } = {}) {
  const g = toNumber(gross);
  const n = toNumber(count);
  const wompiFeeTotal = (g * WOMPI_PERCENT + WOMPI_FIXED_COP * n) * (1 + IVA_RATE);
  const net  = g * CALICO_COMMISSION_RATE - wompiFeeTotal;
  const owed = g * TUTOR_SHARE_RATE;
  return {
    gross: g,
    calicoNet:     Number(net.toFixed(2)),
    tutorPayout:   Number(owed.toFixed(2)),
    wompiFeeTotal: Number(wompiFeeTotal.toFixed(2)),
    effectiveMargin: g > 0 ? net / g : 0,
  };
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
