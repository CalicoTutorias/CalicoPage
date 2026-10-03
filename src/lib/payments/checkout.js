/**
 * Shared checkout contract for every purchasable kind (tutoring session,
 * event registration). An approved Wompi transaction is reconciled against
 * the amount FROZEN in the PaymentIntent at checkout time — the widget's
 * integrity signature already prevents paying any other amount — and then
 * dispatched to the fulfiller for its kind.
 *
 * Never recompute a price from the current catalog here: an admin price
 * change between checkout and approval would refuse a legitimate payment.
 */

import { resolveSessionAmount } from './pricing';
import { readCouponSnapshot } from './coupon-math';
import * as WompiService from '../services/wompi.service';
import { fulfilPaidRegistration } from '../services/event-checkout.service';

export const INTENT_KIND = Object.freeze({ SESSION: 'session', EVENT: 'event' });

export function intentKind(stored) {
  const kind = stored?.kind ?? stored?.metadata?.kind;
  return kind === INTENT_KIND.EVENT ? INTENT_KIND.EVENT : INTENT_KIND.SESSION;
}

function toInt(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : null;
}

/** Charge (COP) signed into the intent, or null for legacy intents without a snapshot. */
export function frozenAmountCop(stored) {
  const m = stored?.metadata;
  if (!m || typeof m !== 'object') return null;

  if (intentKind(stored) === INTENT_KIND.EVENT) {
    const final = toInt(m.finalAmount);
    return final !== null && final > 0 ? final : null;
  }

  if (m.originalAmount === undefined || m.originalAmount === null || m.originalAmount === '') return null;
  const original = toInt(m.originalAmount);
  const discount = toInt(m.discountAmount ?? 0);
  if (original === null || original <= 0 || discount === null || discount < 0) return null;
  return original - discount;
}

/**
 * Expected cents for an approved transaction. Frozen amount when the intent
 * carries one; legacy session intents (created before snapshots existed)
 * fall back to the recomputed course price minus any coupon discount.
 * @returns {Promise<number|null>} null = cannot be determined
 */
export async function expectedAmountCents({ stored, metadata }) {
  const frozen = frozenAmountCop(stored);
  if (frozen !== null) return frozen * 100;
  if (intentKind(stored) === INTENT_KIND.EVENT) return null;

  const { courseId, startTimestamp, endTimestamp } = metadata ?? {};
  if (!courseId || !startTimestamp || !endTimestamp) return null;
  try {
    const priced = await resolveSessionAmount({
      courseId,
      startTimestamp: new Date(startTimestamp),
      endTimestamp: new Date(endTimestamp),
    });
    const snapshot = readCouponSnapshot(stored?.metadata) ?? readCouponSnapshot(metadata);
    return Math.round((priced.amount - (snapshot?.discountAmount ?? 0)) * 100);
  } catch (err) {
    console.warn('[checkout] Could not resolve the expected amount:', err?.message);
    return null;
  }
}

export function amountMatches(paidCents, expectedCents) {
  return Math.abs(Number(paidCents) - expectedCents) <= 1;
}

/** Hand an approved, reconciled transaction to the fulfiller of its kind. */
export async function fulfilApproved(transaction, stored) {
  if (intentKind(stored) === INTENT_KIND.EVENT) return fulfilPaidRegistration(transaction, stored);
  return WompiService.processSuccessfulPayment(transaction);
}
