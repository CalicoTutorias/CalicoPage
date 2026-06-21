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
import { authenticateRequest } from '@/lib/auth/middleware';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as WompiService from '@/lib/services/wompi.service';
import * as paymentIntentRepo from '@/lib/repositories/payment-intent.repository';
import { resolveSessionAmount } from '@/lib/payments/pricing';

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

  const { transactionData: clientTransactionData } = parsed.data;

  // 2. SECURITY: re-fetch the transaction from Wompi using the private key.
  //    Everything below (status, amount, metadata) comes exclusively from
  //    this response — never from the client-supplied body — so a forged
  //    "APPROVED" payload cannot create a session.
  let transaction;
  try {
    transaction = await wompiApi.fetchTransaction(clientTransactionData.id);
  } catch (err) {
    console.error('[confirm-payment] Could not verify transaction with Wompi:', err.message);
    return NextResponse.json(
      { success: false, error: 'No se pudo verificar la transacción con el proveedor de pagos' },
      { status: 502 },
    );
  }

  const { status, amount_in_cents, reference } = transaction;
  let metadata = transaction.metadata ?? {};

  // Wompi's server-to-server transaction lookup doesn't always echo back
  // custom metadata — fall back to the durable PaymentIntent persisted at
  // intent-creation time (same recovery path used inside processSuccessfulPayment).
  if (!metadata.studentId) {
    const stored = await paymentIntentRepo.findByReference(reference);
    if (stored?.metadata?.studentId) {
      metadata = stored.metadata;
    }
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
  if (status !== 'APPROVED') {
    return NextResponse.json(
      { success: false, error: `Pago en estado inesperado: ${status}` },
      { status: 400 },
    );
  }

  // 5. Reconcile amount server-side (Wompi's authoritative amount_in_cents vs course price)
  const { courseId, startTimestamp, endTimestamp } = metadata;
  if (courseId && startTimestamp && endTimestamp) {
    let expectedAmount;
    try {
      const priced = await resolveSessionAmount({
        courseId,
        startTimestamp: new Date(startTimestamp),
        endTimestamp: new Date(endTimestamp),
      });
      expectedAmount = Math.round(priced.amount * 100); // in cents
    } catch (pricingErr) {
      console.warn('[confirm-payment] Could not resolve expected price:', pricingErr.message);
    }

    if (expectedAmount !== undefined) {
      const paidAmount = Number(amount_in_cents);
      if (Math.abs(paidAmount - expectedAmount) > 1) {
        console.error(
          `[confirm-payment] Amount mismatch: paid=${paidAmount} expected=${expectedAmount}`,
        );
        return NextResponse.json(
          { success: false, error: 'El monto del pago no coincide con el precio esperado' },
          { status: 400 },
        );
      }
    }
  }

  // 6. Process the payment (idempotent — dedup by wompiId inside the service)
  try {
    const result = await WompiService.processSuccessfulPayment(transaction);
    return NextResponse.json(
      { success: true, message: 'Pago exitoso', result },
      { status: 200 },
    );
  } catch (error) {
    console.error('[POST /api/payments/confirm-payment] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
