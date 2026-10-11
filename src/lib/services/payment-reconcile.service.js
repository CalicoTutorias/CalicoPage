/**
 * Payment reconcile — recovery path for an approved Wompi transaction that
 * never produced its payment + session.
 *
 * Both live confirmation paths (the student's confirm-payment call and
 * Wompi's webhook) verify the transaction against Wompi's API before booking.
 * When that API is down they can only record/alert and retry later; if the
 * retries are exhausted the charge exists in Wompi with nothing on our side.
 * An admin then replays exactly the same reconcile + fulfil sequence from the
 * authoritative transaction. Fulfilment is idempotent on `wompi_id`, so
 * replaying an already-processed transaction books nothing.
 *
 * Wompi has no lookup by reference, only by transaction id: the id comes
 * either from the admin (Wompi dashboard) or from `pendingTransactionId`,
 * which confirm-payment pins on the intent when verification fails.
 */

import * as wompiApi from './wompi-api.service';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import { expectedAmountCents, amountMatches, fulfilApproved } from '../payments/checkout';

export const RECONCILE_OUTCOME = Object.freeze({
  FULFILLED: 'FULFILLED',
  ALREADY_PROCESSED: 'ALREADY_PROCESSED',
  NOT_APPROVED: 'NOT_APPROVED',
});

function reconcileError(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Resolve the Wompi transaction id to replay: explicit, or the one pinned on
 * the intent by confirm-payment.
 */
async function resolveTransactionId({ transactionId, reference }) {
  const explicit = String(transactionId ?? '').trim();
  if (explicit) return explicit;

  const ref = String(reference ?? '').trim();
  if (!ref) throw reconcileError('INVALID_INPUT', 'transactionId or reference is required');

  const intent = await paymentIntentRepo.findByReference(ref);
  if (!intent) throw reconcileError('INTENT_NOT_FOUND', `No payment intent for reference ${ref}`);

  const pending = String(intent.metadata?.pendingTransactionId ?? '').trim();
  if (!pending) {
    throw reconcileError(
      'NO_PENDING_TRANSACTION',
      `Intent ${ref} has no pending Wompi transaction recorded; pass the transactionId from the Wompi dashboard`,
    );
  }
  return pending;
}

/**
 * Replay an approved transaction through the standard checkout contract.
 *
 * @param {{ transactionId?: string, reference?: string }} input
 * @returns {Promise<{ outcome: string, transactionId: string, reference: string|null,
 *   status: string, amountInCents: number|null, sessionId?: string|null,
 *   paymentId?: string|null, registrationId?: string|null }>}
 * @throws Error with `code`: INVALID_INPUT, INTENT_NOT_FOUND,
 *   NO_PENDING_TRANSACTION, TRANSACTION_NOT_FOUND, PROVIDER_UNAVAILABLE,
 *   AMOUNT_MISMATCH, or any fulfilment business code (SESSION_CONFLICT,
 *   OUTSIDE_AVAILABILITY, MAX_SESSIONS_REACHED, COUPON_LIMIT_EXCEEDED,
 *   INTENT_CONSUMED…).
 */
export async function reconcileTransaction({ transactionId, reference } = {}) {
  const txId = await resolveTransactionId({ transactionId, reference });

  let transaction;
  try {
    transaction = await wompiApi.fetchTransaction(txId);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw reconcileError('TRANSACTION_NOT_FOUND', err.message);
    throw reconcileError('PROVIDER_UNAVAILABLE', err.message, { retryable: true });
  }

  const { status, amount_in_cents, reference: txReference = null } = transaction;
  const base = {
    transactionId: txId,
    reference: txReference,
    status,
    amountInCents: Number.isFinite(Number(amount_in_cents)) ? Number(amount_in_cents) : null,
  };

  if (status !== 'APPROVED') {
    return { outcome: RECONCILE_OUTCOME.NOT_APPROVED, ...base };
  }

  // Same reconciliation as the webhook: the amount is checked against the
  // snapshot frozen in the intent, and the intent supplies the booking
  // metadata Wompi does not echo back.
  const stored = await paymentIntentRepo.findByReference(txReference);
  const echoed = transaction.metadata ?? {};
  const metadata = echoed.courseId || echoed.registrationId ? echoed : (stored?.metadata ?? {});
  const expectedCents = await expectedAmountCents({ stored, metadata });
  if (expectedCents === null) {
    console.warn(`[payment-reconcile] Could not determine the expected amount for ${txReference}; processing without reconciliation`);
  } else if (!amountMatches(amount_in_cents, expectedCents)) {
    throw reconcileError(
      'AMOUNT_MISMATCH',
      `Amount mismatch for ${txId}: paid=${amount_in_cents} expected=${expectedCents}`,
      { paidCents: Number(amount_in_cents), expectedCents },
    );
  }

  const result = await fulfilApproved(transaction, stored);
  const session = result?.session ?? null;
  const registration = result?.registration ?? null;
  const fulfilled = Boolean(session || registration);

  return {
    outcome: fulfilled ? RECONCILE_OUTCOME.FULFILLED : RECONCILE_OUTCOME.ALREADY_PROCESSED,
    ...base,
    sessionId: session?.id ?? null,
    paymentId: result?.payment?.id ?? null,
    registrationId: registration?.id ?? null,
  };
}
