/**
 * Payouts Service
 * Business logic for the manual tutor-payout flow:
 *   - Listing what we owe (per tutor, per payment).
 *   - Marking payouts as completed once the manual transfer is done.
 *   - All mutations write to admin_audit_log.
 */

import * as repo from '../repositories/payouts.repository';
import * as auditService from './admin-audit.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import { tutorPayout, aggregateFinancialsFromTotals, paymentBreakdown } from '../payments/fees';

const { ADMIN_ACTIONS } = auditService;

class DomainError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// ─── Listing ────────────────────────────────────────────────────────────

/**
 * Aggregated weekly digest. For each tutor with pending payouts:
 *   - sum of what we owe: tutor share (`tutorPayout()` — 85% by default) of
 *     the tutor payout BASE, not of the charged amount, so a coupon Calico
 *     absorbed never shrinks the tutor's transfer
 *   - count of payments / sessions
 *   - their llave (or null if missing — UI flags this)
 *   - the list of payment IDs to mark as paid
 *
 * Sorted by amount owed DESC so the largest-pending tutors appear first.
 */
export async function listPendingPayoutsByTutor() {
  const groups = await repo.aggregatePendingByTutor();

  const enriched = groups.map((g) => {
    const tutorBase = g.totalTutorBase ?? g.totalGross;
    const owed = tutorPayout(tutorBase);
    return {
      tutor: g.tutor,
      llave: g.tutor.tutorProfile?.llave ?? null,
      totalGross:     Number(g.totalGross.toFixed(2)),
      totalListGross: Number((g.totalListGross ?? g.totalGross).toFixed(2)),
      totalDiscount:  Number((g.totalDiscount ?? 0).toFixed(2)),
      totalTutorBase: Number(tutorBase.toFixed(2)),
      tutorOwed:      Number(owed.toFixed(2)),
      paymentsCount:  g.paymentsCount,
      paymentIds:     g.paymentIds,
    };
  });

  enriched.sort((a, b) => b.tutorOwed - a.tutorOwed);

  // Headline numbers across all pending payouts — useful for the page banner.
  // The Wompi fee is linear in (gross, count), so the group totals give the
  // exact figures without fabricating per-payment amounts.
  const sumBy = (pick) => groups.reduce((s, g) => s + pick(g), 0);
  const paymentsCount = sumBy((g) => g.paymentsCount);
  const totals = aggregateFinancialsFromTotals({
    gross:     sumBy((g) => g.totalGross),
    count:     paymentsCount,
    tutorBase: sumBy((g) => g.totalTutorBase ?? g.totalGross),
    listGross: sumBy((g) => g.totalListGross ?? g.totalGross),
  });

  return {
    groups: enriched,
    totals: {
      gross:          totals.gross,
      listGross:      totals.listGross,
      discount:       totals.discountTotal,
      discountCalico: totals.discountCalico,
      discountShared: totals.discountShared,
      tutorOwed:      totals.tutorPayout,
      calicoNet:      totals.calicoNet,
      wompiFee:       totals.wompiFeeTotal,
      tutorsCount:    enriched.length,
      paymentsCount,
    },
  };
}

/**
 * Flat list (one row per payment) — for a "detail" tab where the admin
 * wants to see every individual transaction before marking it.
 */
export async function listPendingPayments(opts) {
  const items = await repo.findPendingPayments(opts);
  return items.map((p) => {
    const b = paymentBreakdown(p);
    return {
      id:               p.id,
      gross:            b.amount,
      originalAmount:   b.originalAmount,
      discountAmount:   b.discountAmount,
      tutorPayoutBase:  b.tutorPayoutBase,
      discountAbsorber: b.discountAbsorber,
      tutorOwed:        b.tutorOwed,
      calicoNet:        b.calicoNet,
      wompiFee:         b.wompiFee,
      createdAt:        p.createdAt,
      tutor:            p.tutor,
      llave:            p.tutor.tutorProfile?.llave ?? null,
      session:          p.session,
    };
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────

/**
 * Mark a single payment as paid out. Idempotent (re-marking a paid one is
 * a no-op except for the audit entry).
 *
 * @throws DomainError NOT_FOUND
 */
export async function markPayoutAsPaid({ paymentId, adminId, note, request }) {
  if (!paymentId) throw new DomainError('Missing payment id', 'INVALID_INPUT');

  const updated = await repo.markPayoutAsPaid(paymentId, { adminId, note });
  if (!updated) throw new DomainError('Payment not found', 'NOT_FOUND');

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: 'TUTOR_PAYOUT_MARKED',
    targetType: 'Payment',
    targetId: paymentId,
    payload: {
      tutorId: updated.tutorId,
      note: note ?? null,
      gross: Number(updated.amount),
      // What was actually transferred (85 % of the payout base), so the audit
      // row is reproducible even if the fee model changes later.
      tutorOwed: Number(tutorPayout(updated.tutorPayoutBase ?? updated.amount).toFixed(2)),
    },
    request,
  });

  return updated;
}

/**
 * Bulk-mark a tutor's whole weekly batch in one go. Validates that every id
 * exists and is still pending; partial bulk failures roll back the whole
 * thing inside a transaction.
 */
export async function bulkMarkPayoutsAsPaid({ paymentIds, adminId, note, request }) {
  if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
    throw new DomainError('Selecciona al menos un pago.', 'INVALID_INPUT');
  }

  const result = await repo.markPayoutsAsPaid(paymentIds, { adminId, note });

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: 'TUTOR_PAYOUT_BULK',
    targetType: 'Payment',
    targetId: null,
    payload: { paymentIds, count: result.count, note: note ?? null },
    request,
  });

  return result;
}
