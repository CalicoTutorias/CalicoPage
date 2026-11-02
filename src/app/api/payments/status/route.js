/**
 * GET /api/payments/status?reference=<ref>
 *
 * Booking status of a session checkout, for a client that lost the widget
 * callback or got PAYMENT_PROCESSING from confirm-payment. The intent must
 * belong to the authenticated student (identity from the JWT).
 *
 *   1. A session booked by this intent exists → confirmed.
 *   2. Otherwise ask Wompi (private key) for the reference's transactions:
 *      an APPROVED one goes through the same confirmation pipeline as
 *      confirm-payment; all DECLINED/ERROR/VOIDED → failed; else pending.
 *      A Wompi lookup failure is reported as pending, never as an error.
 *
 * Response: 200 { success: true, state: 'confirmed'|'pending'|'failed', session? }
 * Errors:   { success: false, error: <CODE> } with 401/400/403/404.
 */

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as paymentIntentRepo from '@/lib/repositories/payment-intent.repository';
import * as sessionRepo from '@/lib/repositories/session.repository';
import { confirmApprovedTransaction, intentKind, INTENT_KIND } from '@/lib/payments/checkout';

const FAILED_STATUSES = ['DECLINED', 'ERROR', 'VOIDED'];

function fail(error, status) {
  return NextResponse.json({ success: false, error }, { status });
}

function state(value, session) {
  return NextResponse.json({ success: true, state: value, ...(session ? { session } : {}) }, { status: 200 });
}

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return fail('UNAUTHORIZED', 401);

  const userId = String(auth.sub ?? '').trim();
  if (!userId) return fail('UNAUTHORIZED', 401);

  const reference = new URL(request.url).searchParams.get('reference')?.trim();
  if (!reference) return fail('MISSING_REFERENCE', 400);

  const intent = await paymentIntentRepo.findByReference(reference);
  if (!intent) return fail('NOT_FOUND', 404);
  if (String(intent.metadata?.studentId) !== userId) return fail('FORBIDDEN', 403);
  if (intentKind(intent) !== INTENT_KIND.SESSION) return fail('UNSUPPORTED_INTENT_KIND', 400);

  const booked = await sessionRepo.findSessionByIntentReference(reference);
  if (booked) return state('confirmed', booked);

  let transactions;
  try {
    transactions = (await wompiApi.fetchTransactionsByReference(reference))
      .filter((tx) => tx.reference === reference);
  } catch (err) {
    console.warn(`[payments/status] Could not query Wompi for ${reference}:`, err.message);
    Sentry.withScope((scope) => {
      scope.setTag('service', 'wompi');
      scope.setTag('issue_type', 'provider_fetch_error');
      scope.setLevel('warning');
      scope.setContext('status_info', { reference });
      Sentry.captureException(err);
    });
    return state('pending');
  }

  const approved = transactions.find((tx) => tx.status === 'APPROVED');
  if (approved) {
    try {
      const confirmed = await confirmApprovedTransaction({ transaction: approved, stored: intent });
      if (confirmed.amountMismatch) {
        // Not booked; the webhook flags the mismatch for manual review.
        const { paidCents, expectedCents } = confirmed.amountMismatch;
        console.error(`[payments/status] Amount mismatch for ${reference}: paid=${paidCents} expected=${expectedCents}`);
        return state('pending');
      }
      return state('confirmed', confirmed.result.session);
    } catch (err) {
      // Paid but not booked yet (concurrent confirmation in flight, transient
      // failure or a refusal the webhook alerts on): keep the client polling.
      if (err.code !== 'SESSION_CONFLICT' && err.code !== 'P2034') {
        console.error(`[payments/status] Could not confirm ${reference}:`, err.message);
        Sentry.withScope((scope) => {
          scope.setTag('service', 'wompi');
          scope.setTag('issue_type', 'processing_error');
          scope.setLevel('error');
          scope.setContext('processing_details', {
            wompiTransactionId: approved.id,
            reference,
            reason: err.code,
            errorMessage: err.message,
          });
          Sentry.captureException(err);
        });
      }
      return state('pending');
    }
  }

  if (transactions.length > 0 && transactions.every((tx) => FAILED_STATUSES.includes(tx.status))) {
    return state('failed');
  }
  return state('pending');
}
