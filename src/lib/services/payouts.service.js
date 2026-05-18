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
import { tutorPayout, calicoNet, wompiFee, aggregateFinancials } from '../payments/fees';

const { ADMIN_ACTIONS } = auditService;

class DomainError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// ─── Listing ────────────────────────────────────────────────────────────

/**
 * Aggregated weekly digest. For each tutor with pending payouts:
 *   - sum of what we owe (tutor share via `tutorPayout()` — 80% by default)
 *   - count of payments / sessions
 *   - their llave (or null if missing — UI flags this)
 *   - the list of payment IDs to mark as paid
 *
 * Sorted by amount owed DESC so the largest-pending tutors appear first.
 */
export async function listPendingPayoutsByTutor() {
  const groups = await repo.aggregatePendingByTutor();

  const enriched = groups.map((g) => {
    const owed = tutorPayout(g.totalGross);
    return {
      tutor: g.tutor,
      llave: g.tutor.tutorProfile?.llave ?? null,
      totalGross:    Number(g.totalGross.toFixed(2)),
      tutorOwed:     Number(owed.toFixed(2)),
      paymentsCount: g.paymentsCount,
      paymentIds:    g.paymentIds,
    };
  });

  enriched.sort((a, b) => b.tutorOwed - a.tutorOwed);

  // Headline numbers across all pending payouts — useful for the page banner.
  const allAmounts = groups.flatMap((g) => Array(g.paymentsCount).fill(g.totalGross / g.paymentsCount));
  const totals = aggregateFinancials(allAmounts);

  return {
    groups: enriched,
    totals: {
      gross:        totals.gross,
      tutorOwed:    totals.tutorPayout,
      calicoNet:    totals.calicoNet,
      wompiFee:     totals.wompiFeeTotal,
      tutorsCount:  enriched.length,
      paymentsCount: groups.reduce((s, g) => s + g.paymentsCount, 0),
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
    const gross = Number(p.amount);
    return {
      id:        p.id,
      gross,
      tutorOwed: Number(tutorPayout(gross).toFixed(2)),
      calicoNet: Number(calicoNet(gross).toFixed(2)),
      wompiFee:  Number(wompiFee(gross).toFixed(2)),
      createdAt: p.createdAt,
      tutor:     p.tutor,
      llave:     p.tutor.tutorProfile?.llave ?? null,
      session:   p.session,
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
    payload: { tutorId: updated.tutorId, note: note ?? null, gross: Number(updated.amount) },
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
