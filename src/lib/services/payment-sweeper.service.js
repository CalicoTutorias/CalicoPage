/**
 * Payment sweeper — the safety net for a charge no confirmation path booked.
 *
 * A paid booking is confirmed by the student's browser (confirm-payment) or by
 * Wompi's webhook. Asynchronous methods (PSE, Nequi) rely on the webhook
 * alone, and when it never arrives (no events URL in Wompi, missing
 * WOMPI_EVENTS_SECRET, the student closed the tab…) nothing errors: the only
 * trace is a payment intent with `consumed_at IS NULL`, which looks exactly
 * like an abandoned checkout until Wompi is asked. In 2026-11 that hid weeks
 * of PSE payments that never became sessions.
 *
 * Every run (POST /api/jobs/reconcile-payments, every 10 minutes) asks Wompi,
 * by reference, about the recent unconsumed intents and books the approved
 * ones through the standard reconcile path (`reconcileTransaction`, idempotent
 * on the Wompi id) — unless booking would be wrong (the slot already passed,
 * or the team already booked it by hand), which is reported as
 * NEEDS_ATTENTION. Each result is stored in `metadata.sweep`; the shape is a
 * contract read by the admin panel (docs/ops/payments-sweeper.md).
 */

import * as Sentry from '@sentry/nextjs';
import * as wompiApi from './wompi-api.service';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import * as sessionRepo from '../repositories/session.repository';
import { reconcileTransaction } from './payment-reconcile.service';
import { intentKind, INTENT_KIND } from '../payments/checkout';
import { isPaidNotBooked } from '../payments/booking-refusals';

export const SWEEP_OUTCOME = Object.freeze({
  FULFILLED: 'FULFILLED',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  NOT_APPROVED: 'NOT_APPROVED',
  NO_TRANSACTION: 'NO_TRANSACTION',
  NEEDS_ATTENTION: 'NEEDS_ATTENTION',
  ERROR: 'ERROR',
});

/** `metadata.sweep.status` when Wompi has no transaction for the reference. */
export const NO_TRANSACTION_STATUS = 'NO_TRANSACTION';

/** Wompi statuses that never change again: such an intent is not asked about twice. */
export const FINAL_WOMPI_STATUSES = Object.freeze(['DECLINED', 'VOIDED', 'ERROR']);

/**
 * Approved but not booked: a human decides (refund, reconcile endpoint). The
 * sweeper does not touch the intent again — no repeated alert, and no late
 * booking of a charge that may have been refunded meanwhile.
 */
const HUMAN_OWNED_OUTCOMES = Object.freeze([SWEEP_OUTCOME.NEEDS_ATTENTION]);

const MINUTE_MS = 60_000;
/** Younger intents are still in the student's hands (widget open, bank redirect). */
export const MIN_AGE_MS = 10 * MINUTE_MS;
/** Older ones are out of scope: Wompi's own webhook retries (30 min, 3 h, 24 h) are long over. */
export const MAX_AGE_MS = 48 * 60 * MINUTE_MS;
export const DEFAULT_LIMIT = 40;
/** No new intent is started after this, so the route answers inside its maxDuration. */
export const DEFAULT_BUDGET_MS = 30_000;

/** Guard reasons (the business-error reasons are the reconcile error codes). */
export const SWEEP_REASON = Object.freeze({
  SLOT_PASSED: 'SLOT_PASSED',
  POSSIBLE_MANUAL_DUPLICATE: 'POSSIBLE_MANUAL_DUPLICATE',
});

/** Outcomes listed one by one in the run summary (the rest are only counted). */
const LISTED_OUTCOMES = new Set([SWEEP_OUTCOME.FULFILLED, SWEEP_OUTCOME.NEEDS_ATTENTION, SWEEP_OUTCOME.ERROR]);

const ALERTS = {
  [SWEEP_OUTCOME.FULFILLED]: {
    level: 'error',
    issueType: 'sweeper_rescued',
    message: 'Booked an approved payment that the webhook and confirm-payment both missed',
  },
  [SWEEP_OUTCOME.NEEDS_ATTENTION]: {
    level: 'fatal',
    issueType: 'paid_not_booked',
    message: 'Approved payment the sweeper must not book — manual review',
  },
  [SWEEP_OUTCOME.ERROR]: {
    level: 'warning',
    issueType: 'sweeper_error',
    message: 'Could not check the payment intent; retried next run',
  },
};

function errorReason(err) {
  return String(err?.code || err?.message || 'UNKNOWN').slice(0, 200);
}

/** Reconcile errors that mean "paid, and must not be booked as-is" (same split as the webhook). */
function needsHuman(err) {
  return isPaidNotBooked(err) || err?.code === 'EVENT_REGISTRATION_MISSING';
}

function createdMs(transaction) {
  const ms = Date.parse(transaction?.created_at);
  return Number.isFinite(ms) ? ms : -Infinity;
}

/** The APPROVED transaction if any, otherwise the most recent one, otherwise null. */
function pickTransaction(transactions) {
  const approved = transactions.find((t) => t?.status === 'APPROVED');
  if (approved) return approved;
  return transactions.reduce((latest, t) => (!latest || createdMs(t) > createdMs(latest) ? t : latest), null);
}

/**
 * Why an approved session intent must not be booked now, or null. A session
 * the team already created by hand (not linked to the intent) is checked
 * first: it means the student was probably served, which matters more to the
 * reviewer than the slot having passed.
 */
async function bookingGuard(intent, now) {
  if (intentKind(intent) !== INTENT_KIND.SESSION) return null;
  const m = intent.metadata ?? {};

  if (m.studentId && m.tutorId && m.courseId) {
    const manual = await sessionRepo.findActiveSessionCreatedAfter({
      studentId: m.studentId,
      tutorId: m.tutorId,
      courseId: m.courseId,
      createdAfter: new Date(intent.createdAt),
      excludeIntentReference: intent.reference,
    });
    if (manual) return SWEEP_REASON.POSSIBLE_MANUAL_DUPLICATE;
  }

  const startMs = Date.parse(m.startTimestamp);
  if (Number.isFinite(startMs) && startMs <= now.getTime()) return SWEEP_REASON.SLOT_PASSED;
  return null;
}

/** Ask Wompi about one intent and act on the answer. Never throws. */
async function checkIntent(intent, now) {
  let transaction;
  try {
    transaction = pickTransaction(await wompiApi.findTransactionsByReference(intent.reference, { since: intent.createdAt }));
  } catch (err) {
    return { status: null, transaction: null, outcome: SWEEP_OUTCOME.ERROR, reason: errorReason(err) };
  }

  if (!transaction) {
    return { status: NO_TRANSACTION_STATUS, transaction: null, outcome: SWEEP_OUTCOME.NO_TRANSACTION, reason: null };
  }
  const base = { status: transaction.status ?? null, transaction };
  if (transaction.status !== 'APPROVED') {
    return { ...base, outcome: SWEEP_OUTCOME.NOT_APPROVED, reason: null };
  }

  try {
    const guard = await bookingGuard(intent, now);
    if (guard) return { ...base, outcome: SWEEP_OUTCOME.NEEDS_ATTENTION, reason: guard };

    const result = await reconcileTransaction({ transactionId: transaction.id, reference: intent.reference });
    return { ...base, status: result.status ?? base.status, outcome: result.outcome, reason: null };
  } catch (err) {
    const outcome = needsHuman(err) ? SWEEP_OUTCOME.NEEDS_ATTENTION : SWEEP_OUTCOME.ERROR;
    return { ...base, outcome, reason: errorReason(err) };
  }
}

function alert(intent, kind, checked) {
  const spec = ALERTS[checked.outcome];
  if (!spec) return;
  const { transaction, outcome, reason, status } = checked;
  Sentry.withScope((scope) => {
    scope.setTag('service', 'wompi');
    scope.setTag('issue_type', spec.issueType);
    if (outcome === SWEEP_OUTCOME.NEEDS_ATTENTION) scope.setTag('reason', reason);
    scope.setLevel(spec.level);
    scope.setFingerprint(['payments', 'payment-sweeper', spec.issueType, intent.reference]);
    scope.setContext('payment_sweep', {
      reference: intent.reference,
      transactionId: transaction?.id ?? null,
      kind,
      amountInCents: transaction?.amount_in_cents ?? null,
      status,
      reason,
    });
    Sentry.captureMessage(`[payment-sweeper] ${spec.message}: ${intent.reference}${reason ? ` (${reason})` : ''}`);
  });
}

/**
 * One sweep over the recent unconsumed payment intents (both kinds).
 *
 * @param {{ now?: Date, limit?: number, budgetMs?: number }} [options]
 * @returns {Promise<{ checked: number, deferred: number,
 *   counts: Record<string, number>,
 *   items: Array<{ reference: string, kind: string, outcome: string, reason: string|null }> }>}
 *   `items` lists the FULFILLED, NEEDS_ATTENTION and ERROR results; `deferred`
 *   counts selected intents left for the next run by the time budget.
 */
export async function sweepUnconsumedIntents({ now = new Date(), limit = DEFAULT_LIMIT, budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const startedAt = Date.now();
  const intents = await paymentIntentRepo.findUnconsumedForSweep({
    createdFrom: new Date(now.getTime() - MAX_AGE_MS),
    createdTo: new Date(now.getTime() - MIN_AGE_MS),
    skipStatuses: FINAL_WOMPI_STATUSES,
    skipOutcomes: HUMAN_OWNED_OUTCOMES,
    limit,
  });

  const counts = Object.fromEntries(Object.values(SWEEP_OUTCOME).map((outcome) => [outcome, 0]));
  const items = [];
  let checked = 0;

  for (const intent of intents) {
    if (Date.now() - startedAt >= budgetMs) break;
    checked += 1;
    const kind = intentKind(intent);
    const result = await checkIntent(intent, now);

    await paymentIntentRepo.recordSweepResult(intent.reference, {
      status: result.status,
      transactionId: result.transaction?.id != null ? String(result.transaction.id) : null,
      outcome: result.outcome,
      reason: result.reason,
      checkedAt: now.toISOString(),
    });

    counts[result.outcome] += 1;
    if (LISTED_OUTCOMES.has(result.outcome)) {
      items.push({ reference: intent.reference, kind, outcome: result.outcome, reason: result.reason });
      console.warn(`[payment-sweeper] ${intent.reference} (${kind}): ${result.outcome}${result.reason ? ` ${result.reason}` : ''}`);
      alert(intent, kind, result);
    }
  }

  const summary = { checked, deferred: intents.length - checked, counts, items };
  console.info(`[payment-sweeper] checked=${checked} deferred=${summary.deferred} ${JSON.stringify(counts)}`);
  return summary;
}
