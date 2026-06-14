/**
 * POST /api/payments/confirm-payment
 *
 * Client-side payment confirmation (fallback for when the webhook arrives late).
 * The client sends the transaction data it received from the Wompi widget.
 * The server validates the studentId against the authenticated user, checks
 * the status, reconciles the amount server-side, and then delegates to the
 * wompi service to create the payment and session records.
 *
 * Body:
 *   { reference: string, transactionData: { id, status, amount_in_cents, metadata } }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as WompiService from '@/lib/services/wompi.service';
import { resolveSessionAmount } from '@/lib/payments/pricing';

const metadataSchema = z.object({
  studentId: z.string(),
  tutorId: z.string().optional(),
  courseId: z.string().optional(),
  startTimestamp: z.string().optional(),
  endTimestamp: z.string().optional(),
  topicsToReview: z.string().optional(),
  attachments: z.string().optional(),
}).passthrough();

const bodySchema = z.object({
  reference: z.string().min(1),
  transactionData: z.object({
    id: z.string(),
    status: z.string(),
    amount_in_cents: z.number(),
    metadata: metadataSchema,
  }).passthrough(),
});

export async function POST(request) {
  // 1. Authenticate the caller
  const auth = authenticateRequest(request);
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

  const { transactionData } = parsed.data;
  const { status, metadata, amount_in_cents } = transactionData;

  // 2. Verify the authenticated user is the student in this transaction
  const transactionStudentId = String(metadata.studentId ?? '').trim();
  if (!transactionStudentId || transactionStudentId !== authenticatedUserId) {
    return NextResponse.json(
      { success: false, error: 'Cannot confirm payment for another student' },
      { status: 403 },
    );
  }

  // 3. Check payment status before doing anything else
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

  // 4. Reconcile amount server-side (non-blocking — skipped if pricing unavailable)
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

  // 5. Process the payment (idempotent — dedup by wompiId inside the service)
  try {
    const result = await WompiService.processSuccessfulPayment(transactionData);
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
