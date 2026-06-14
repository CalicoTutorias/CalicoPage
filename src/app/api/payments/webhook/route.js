/**
 * POST /api/payments/webhook
 * Wompi events webhook.
 *
 * Security model:
 *   1. Verify the event checksum against WOMPI_EVENTS_SECRET (separate from the
 *      integrity secret used for the checkout widget).
 *   2. Re-fetch the transaction from Wompi's API using the private key to get
 *      the authoritative status and amount — never trust the webhook body alone.
 *   3. Reconcile the amount against the expected price for the booking.
 *   4. Process idempotently (dedup by wompiId).
 *
 * Wompi checksum algorithm (Colombia):
 *   SHA-256( tx.id + tx.status + tx.amount_in_cents + tx.currency + timestamp + WOMPI_EVENTS_SECRET )
 */

import * as wompiApi from '@/lib/services/wompi-api.service';
import * as WompiService from '@/lib/services/wompi.service';
import { resolveSessionAmount } from '@/lib/payments/pricing';

export async function POST(request) {
  let rawBody;
  let eventBody;

  try {
    rawBody = await request.text();
    eventBody = JSON.parse(rawBody);
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // 1. Verify the event signature using WOMPI_EVENTS_SECRET
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
  if (!eventsSecret) {
    console.error('[Wompi Webhook] WOMPI_EVENTS_SECRET is not configured');
    return Response.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  const signatureValid = wompiApi.verifyEventChecksum(eventBody, eventsSecret);
  if (!signatureValid) {
    console.error('[Wompi Webhook] Invalid event checksum — request rejected');
    return Response.json({ success: false, error: 'Invalid signature' }, { status: 401 });
  }

  const { event } = eventBody;

  if (event !== 'transaction.updated') {
    return Response.json(
      { success: true, message: 'Event acknowledged but not processed' },
      { status: 200 },
    );
  }

  // 2. Re-fetch the transaction from Wompi to get authoritative data
  const webhookTransactionId = eventBody?.data?.transaction?.id;
  if (!webhookTransactionId) {
    console.error('[Wompi Webhook] Missing transaction ID in event body');
    return Response.json({ success: false, error: 'Missing transaction ID' }, { status: 400 });
  }

  let transaction;
  try {
    transaction = await wompiApi.fetchTransaction(webhookTransactionId);
  } catch (err) {
    console.error('[Wompi Webhook] Could not re-fetch transaction from Wompi:', err.message);
    // Return 200 so Wompi doesn't retry — this will be handled by the confirm-payment fallback
    return Response.json(
      { success: false, error: 'Could not verify transaction with provider' },
      { status: 200 },
    );
  }

  const { status: transactionStatus, amount_in_cents, reference } = transaction;

  if (transactionStatus === 'APPROVED') {
    // 3. Reconcile amount against the server-side price
    const metadata = transaction.metadata ?? {};
    const { courseId, startTimestamp, endTimestamp } = metadata;

    if (courseId && startTimestamp && endTimestamp) {
      try {
        const priced = await resolveSessionAmount({
          courseId,
          startTimestamp: new Date(startTimestamp),
          endTimestamp: new Date(endTimestamp),
        });
        const expectedCents = Math.round(priced.amount * 100);
        const paidCents = Number(amount_in_cents);

        if (Math.abs(paidCents - expectedCents) > 1) {
          console.error(
            `[Wompi Webhook] Amount mismatch for ${webhookTransactionId}: ` +
            `paid=${paidCents} expected=${expectedCents} — flagged for manual review`,
          );
          // Do not process: mismatch could indicate price manipulation
          return Response.json(
            { success: false, error: 'Amount mismatch — flagged for manual review' },
            { status: 200 },
          );
        }
      } catch (pricingErr) {
        console.warn('[Wompi Webhook] Could not validate amount:', pricingErr.message);
      }
    }

    // 4. Process payment (idempotent)
    try {
      const result = await WompiService.processSuccessfulPayment(transaction);
      console.log(
        `[Wompi Webhook] ✓ Payment approved: wompi_id=${webhookTransactionId}, session=${result.session?.id}`,
      );
      return Response.json({ success: true, message: 'Payment processed successfully' }, { status: 200 });
    } catch (err) {
      const businessErrors = ['SESSION_CONFLICT', 'OUTSIDE_AVAILABILITY', 'MAX_SESSIONS_REACHED'];
      if (businessErrors.includes(err.code)) {
        console.error(
          `[Wompi Webhook] SLOT CONFLICT after payment — manual refund may be required. ` +
          `wompi_id=${webhookTransactionId}, reason=${err.code}: ${err.message}`,
        );
      } else {
        console.error('[Wompi Webhook] Processing error:', err.message);
      }
      return Response.json({ success: false, error: 'Processing error' }, { status: 200 });
    }
  }

  if (transactionStatus === 'DECLINED' || transactionStatus === 'ERROR') {
    const studentId = transaction.metadata?.studentId ?? reference?.split('-')[0];
    await WompiService.handleFailedPayment({
      wompiTransactionId: webhookTransactionId,
      reference,
      reason: transactionStatus,
      studentId,
    });
    return Response.json({ success: true, message: 'Payment failure acknowledged' }, { status: 200 });
  }

  return Response.json(
    { success: true, message: `Transaction status: ${transactionStatus}` },
    { status: 200 },
  );
}
