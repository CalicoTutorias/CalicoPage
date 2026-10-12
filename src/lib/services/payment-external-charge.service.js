/**
 * Record an external Wompi charge on a courtesy payment.
 *
 * A session booked with a 100 % coupon is written as amount 0 with the whole
 * list price as a discount Calico absorbed. When that booking only replaced
 * a payment Wompi DID collect (an approved charge lost during a provider
 * outage, student re-booked through the page), the books must follow the
 * money: the row becomes the normal charge, linked to the real transaction,
 * and the coupon use is released.
 *
 * The transaction is verified with the private key first — it must be
 * APPROVED for exactly the list price — so a typo cannot rewrite a payment.
 */

import * as wompiApi from './wompi-api.service';
import * as paymentRepo from '../repositories/payment.repository';
import * as paymentIntentRepo from '../repositories/payment-intent.repository';
import * as auditService from './admin-audit.service';
import { amountMatches } from '../payments/checkout';

function fail(code, message, extra = {}) {
  const err = new Error(message);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

const toNumber = (v) => (v == null ? 0 : Number(v));

function moneySnapshot(payment) {
  return {
    amount: toNumber(payment.amount),
    originalAmount: toNumber(payment.originalAmount),
    discountAmount: toNumber(payment.discountAmount),
    tutorPayoutBase: toNumber(payment.tutorPayoutBase),
    couponId: payment.couponId ?? null,
    wompiId: payment.wompiId ?? null,
    status: payment.status,
  };
}

/**
 * @param {{ wompiId: string, paymentId?: string, sessionId?: string, adminId: string, request?: Request }} input
 * @returns {Promise<{ payment: object, releasedRedemptions: number,
 *   transaction: { id: string, status: string, amountInCents: number, reference: string|null } }>}
 * @throws Error with `code`: INVALID_INPUT, NOT_FOUND, ALREADY_CHARGED,
 *   NOT_COURTESY, WOMPI_ID_IN_USE, TRANSACTION_NOT_FOUND, PROVIDER_UNAVAILABLE,
 *   NOT_APPROVED, AMOUNT_MISMATCH.
 */
export async function recordExternalCharge({ wompiId, paymentId, sessionId, adminId, request }) {
  const txnId = String(wompiId ?? '').trim();
  if (!txnId) throw fail('INVALID_INPUT', 'wompiId is required');

  const payment = paymentId
    ? await paymentRepo.findById(String(paymentId).trim())
    : sessionId
      ? await paymentRepo.findBySessionId(String(sessionId).trim())
      : null;
  if (!payment) throw fail('NOT_FOUND', 'Payment not found');

  if (payment.wompiId) {
    throw fail('ALREADY_CHARGED', `Payment ${payment.id} is already linked to Wompi transaction ${payment.wompiId}`);
  }
  const listPrice = toNumber(payment.originalAmount);
  if (toNumber(payment.amount) !== 0 || toNumber(payment.discountAmount) !== listPrice || listPrice <= 0) {
    throw fail('NOT_COURTESY', `Payment ${payment.id} is not a courtesy (100 % coupon) payment`);
  }
  if (await paymentRepo.existsByWompiId(txnId)) {
    throw fail('WOMPI_ID_IN_USE', `Wompi transaction ${txnId} is already recorded on another payment`);
  }

  // The money must really be there: APPROVED, and for exactly the list price.
  let transaction;
  try {
    transaction = await wompiApi.fetchTransaction(txnId);
  } catch (err) {
    if (err.code === 'NOT_FOUND') throw fail('TRANSACTION_NOT_FOUND', err.message);
    throw fail('PROVIDER_UNAVAILABLE', err.message, { retryable: true });
  }
  if (transaction.status !== 'APPROVED') {
    throw fail('NOT_APPROVED', `Wompi transaction ${txnId} is ${transaction.status}, not APPROVED`);
  }
  const paidCents = Number(transaction.amount_in_cents);
  if (!amountMatches(paidCents, listPrice * 100)) {
    throw fail(
      'AMOUNT_MISMATCH',
      `Wompi charged ${paidCents} cents but the session's list price is ${listPrice * 100} cents`,
      { paidCents, expectedCents: listPrice * 100 },
    );
  }

  const before = moneySnapshot(payment);
  const result = await paymentRepo.recordExternalCharge({ paymentId: payment.id, wompiId: txnId });

  // The intent that carried the real charge is settled now: keep it out of
  // the lost-payment query.
  const reference = transaction.reference ?? null;
  if (reference) await paymentIntentRepo.markConsumed(reference);

  await auditService.logAction({
    adminId,
    action: auditService.ADMIN_ACTIONS.PAYMENT_EXTERNAL_CHARGE,
    targetType: 'Payment',
    targetId: payment.id,
    payload: {
      before,
      after: moneySnapshot(result.payment),
      wompiId: txnId,
      reference,
      sessionId: payment.sessionId,
      releasedRedemptions: result.releasedRedemptions,
    },
    request,
  });

  return {
    payment: result.payment,
    releasedRedemptions: result.releasedRedemptions,
    transaction: { id: txnId, status: transaction.status, amountInCents: paidCents, reference },
  };
}
