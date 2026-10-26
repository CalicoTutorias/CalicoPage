/**
 * POST /api/payments/confirm-payment
 *
 * Client-side payment confirmation (fallback for when the webhook arrives late).
 * The client only supplies the Wompi transaction ID. Status, amount and
 * metadata used to create the payment/session are re-fetched from Wompi's
 * API with the private key — never trusted from the request body. This
 * mirrors the trust model of /api/payments/webhook.
 *
 * Body:
 *   { reference: string, transactionData: { id: string } }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as paymentIntentRepo from '@/lib/repositories/payment-intent.repository';
import { expectedAmountCents, amountMatches, fulfilApproved } from '@/lib/payments/checkout';
import { isPaidNotBooked } from '@/lib/payments/booking-refusals';

const bodySchema = z
  .object({
    reference: z.string().min(1),
    transactionData: z
      .object({
        id: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export async function POST(request) {
  // 1. Authenticate the caller
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const authenticatedUserId = String(auth.sub ?? '').trim();
  if (!authenticatedUserId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' },
      { status: 400 },
    );
  }

  const { reference: clientReference, transactionData: clientTransactionData } = parsed.data;

  // 2. SECURITY: re-fetch the transaction from Wompi using the private key.
  //    Everything below (status, amount, metadata) comes exclusively from
  //    this response — never from the client-supplied body — so a forged
  //    "APPROVED" payload cannot create a session.
  let transaction;
  try {
    // The reference only narrows the keyed search; the match must also carry
    // this exact transaction id, so a wrong client reference finds nothing.
    transaction = await wompiApi.fetchTransaction(clientTransactionData.id, { reference: clientReference });
  } catch (err) {
    // Wompi could not tell us what happened, but the widget already reported
    // the charge: the money may be gone and NOTHING is persisted yet (this is
    // exactly how the 2026-10-09 payment was lost). Pin the transaction id on
    // the student's own intent so the webhook retry or an admin reconcile
    // (/api/admin/payments/reconcile) can finish the booking, alert support,
    // and answer a retryable 503 so the client keeps the form locked instead
    // of inviting a second payment.
    const stored = await paymentIntentRepo.findByReference(clientReference);
    const ownsIntent = String(stored?.metadata?.studentId ?? '').trim() === authenticatedUserId;
    if (ownsIntent) {
      await paymentIntentRepo.recordPendingTransaction(clientReference, clientTransactionData.id);
    }

    console.error('[confirm-payment] Could not verify transaction with Wompi:', err.message);
    Sentry.withScope((scope) => {
      scope.setTag('service', 'wompi');
      scope.setTag('issue_type', 'provider_fetch_error');
      scope.setLevel('error');
      scope.setContext('confirm_payment', {
        reference: clientReference,
        transactionId: clientTransactionData.id,
        studentId: authenticatedUserId,
        pendingTransactionRecorded: ownsIntent,
        providerCode: err.code ?? null,
      });
      Sentry.captureException(err);
    });

    return NextResponse.json(
      {
        success: false,
        error: 'PROVIDER_UNAVAILABLE',
        retryable: true,
        reference: clientReference,
        message: 'No se pudo verificar la transacción con el proveedor de pagos',
      },
      { status: 503 },
    );
  }

  const { status, amount_in_cents, reference } = transaction;
  let metadata = transaction.metadata ?? {};

  // The durable PaymentIntent persisted at intent-creation time is the
  // server-side source of truth: it recovers the booking metadata (Wompi's
  // lookup doesn't always echo it) AND carries the coupon snapshot the paid
  // amount is reconciled against — never anything from the client body.
  const stored = await paymentIntentRepo.findByReference(reference);
  if (!metadata.studentId && stored?.metadata?.studentId) {
    metadata = stored.metadata;
  }

  // 3. Verify the authenticated user is the student in this transaction
  //    (identity comes from Wompi/PaymentIntent, not the client body)
  const transactionStudentId = String(metadata.studentId ?? '').trim();
  if (!transactionStudentId || transactionStudentId !== authenticatedUserId) {
    return NextResponse.json(
      { success: false, error: 'Cannot confirm payment for another student' },
      { status: 403 },
    );
  }

  // 4. Check payment status (from Wompi, not the client)
  if (status === 'ERROR') {
    return NextResponse.json(
      { success: false, error: 'Error procesando el pago, intenta nuevamente' },
      { status: 400 },
    );
  }
  if (status === 'DECLINED') {
    return NextResponse.json(
      { success: false, error: 'Pago rechazado (fondos insuficientes u otro motivo)' },
      { status: 400 },
    );
  }
  if (status === 'PENDING') {
    // PSE, Nequi or a bank transfer the bank has not settled yet: the money
    // may still be taken. Pin the transaction so the webhook retry or an
    // admin reconcile by reference can finish the booking once Wompi
    // approves it, and tell the client to keep the form locked (it polls).
    await paymentIntentRepo.recordPendingTransaction(reference, transaction.id);
    return NextResponse.json(
      {
        success: false,
        error: 'PAYMENT_PENDING',
        retryable: true,
        pending: true,
        reference,
        message: 'El pago está pendiente de aprobación del banco',
      },
      { status: 202 },
    );
  }
  if (status !== 'APPROVED') {
    return NextResponse.json(
      { success: false, error: `Pago en estado inesperado: ${status}` },
      { status: 400 },
    );
  }

  // 5. Reconcile Wompi's authoritative amount against the amount frozen in
  //    the server-side intent (legacy intents: recomputed course price).
  const expectedCents = await expectedAmountCents({ stored, metadata });
  if (expectedCents === null) {
    console.warn(`[confirm-payment] Could not determine the expected amount for ${reference}; processing without reconciliation`);
  } else if (!amountMatches(amount_in_cents, expectedCents)) {
    console.error(`[confirm-payment] Amount mismatch: paid=${amount_in_cents} expected=${expectedCents}`);
    return NextResponse.json(
      { success: false, error: 'El monto del pago no coincide con el precio esperado' },
      { status: 400 },
    );
  }

  // 6. Process the payment (idempotent — dedup by wompiId inside the service)
  try {
    const result = await fulfilApproved(transaction, stored);
    return NextResponse.json(
      { success: true, message: 'Pago exitoso', result },
      { status: 200 },
    );
  } catch (error) {
    // The charge is APPROVED in Wompi and nothing was booked. Pin the
    // transaction on the intent so /api/admin/payments/reconcile can replay it
    // by reference, and alert — before this, an unexpected error here only
    // reached the server log.
    try {
      await paymentIntentRepo.recordPendingTransaction(reference, transaction.id);
    } catch (pinErr) {
      console.error(`[confirm-payment] Could not pin pending transaction ${transaction.id} on ${reference}:`, pinErr.message);
    }

    const paidNotBooked = isPaidNotBooked(error);
    console.error(
      `[confirm-payment] ${paidNotBooked ? 'PAID BUT NOT BOOKED' : 'Fulfilment error'} ` +
      `(${error.code ?? 'UNKNOWN'}): wompi_id=${transaction.id} reference=${reference} — ${error.message}`,
    );
    Sentry.withScope((scope) => {
      scope.setTag('service', 'wompi');
      scope.setTag('issue_type', paidNotBooked ? 'paid_not_booked' : 'fulfilment_error');
      scope.setTag('reason', error.code ?? 'UNKNOWN');
      scope.setLevel(paidNotBooked ? 'fatal' : 'error');
      // Same fingerprint as the webhook so one charge = one Sentry issue.
      scope.setFingerprint(['payments', 'paid-not-booked', String(transaction.id)]);
      scope.setContext('confirm_payment', {
        reference,
        transactionId: transaction.id,
        studentId: authenticatedUserId,
        amountInCents: amount_in_cents,
        startTimestamp: metadata.startTimestamp ?? null,
        tutorId: metadata.tutorId ?? null,
      });
      Sentry.captureException(error);
    });

    if (paidNotBooked) {
      // Deterministic: retrying books nothing. Support refunds or reschedules.
      return NextResponse.json(
        {
          success: false,
          error: error.code,
          retryable: false,
          reference,
          message: 'El pago fue recibido pero no se pudo registrar la sesión. Soporte te contactará.',
        },
        { status: 409 },
      );
    }
    // Unknown (DB hiccup, Calendar, …): fulfilment is idempotent on wompi_id,
    // so let the client retry instead of giving up on the first failure.
    return NextResponse.json(
      {
        success: false,
        error: 'FULFILMENT_ERROR',
        retryable: true,
        reference,
        message: 'Recibimos tu pago y estamos registrando la sesión',
      },
      { status: 503 },
    );
  }
}
