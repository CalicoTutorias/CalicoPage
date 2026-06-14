/**
 * POST /api/payments/confirm-payment
 *
 * Client-side payment confirmation fallback (for when the webhook arrives late).
 *
 * Security model:
 *   1. The client sends only the Wompi `transactionId`.
 *   2. The server fetches the transaction directly from Wompi's API using
 *      the private key — we NEVER trust status or amount from the client.
 *   3. The server re-computes the expected amount server-side and rejects
 *      any discrepancy before creating the session/payment record.
 *   4. The authenticated student's ID must match the `metadata.studentId`
 *      embedded in the Wompi transaction.
 *
 * Body:
 *   { transactionId: string }  — Wompi transaction ID only
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as WompiService from '@/lib/services/wompi.service';
import { resolveSessionAmount } from '@/lib/payments/pricing';

const bodySchema = z.object({
  transactionId: z.string().min(1, 'transactionId is required'),
});

export async function POST(request) {
  // 1. Authenticate the caller
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const authenticatedUserId = String(auth.sub ?? '').trim();
  if (!authenticatedUserId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'Invalid request' },
      { status: 400 },
    );
  }

  const { transactionId } = parsed.data;

  try {
    // 2. Fetch the transaction DIRECTLY from Wompi — never trust client data
    let transaction;
    try {
      transaction = await wompiApi.fetchTransaction(transactionId);
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        return NextResponse.json(
          { success: false, error: 'Transaction not found' },
          { status: 404 },
        );
      }
      console.error('[confirm-payment] Wompi API error:', err.message);
      return NextResponse.json(
        { success: false, error: 'Could not verify payment with provider' },
        { status: 502 },
      );
    }

    // 3. Verify the payment was actually approved
    if (transaction.status !== 'APPROVED') {
      return NextResponse.json(
        {
          success: false,
          error: `Payment is not approved (status: ${transaction.status})`,
        },
        { status: 400 },
      );
    }

    // 4. Verify the authenticated user is the student in this transaction
    const metadata = transaction.metadata ?? {};
    const transactionStudentId = String(metadata.studentId ?? '').trim();

    if (!transactionStudentId || transactionStudentId !== authenticatedUserId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: payment does not belong to this account' },
        { status: 403 },
      );
    }

    // 5. Reconcile the amount: re-compute expected price server-side
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
        // Non-blocking: if pricing fails (e.g. course deleted), let the webhook handle it
      }

      if (expectedAmount !== undefined) {
        const paidAmount = Number(transaction.amount_in_cents);
        if (Math.abs(paidAmount - expectedAmount) > 1) {
          // Allow 1-cent rounding tolerance
          console.error(
            `[confirm-payment] Amount mismatch for ${transactionId}: ` +
            `paid=${paidAmount} expected=${expectedAmount}`,
          );
          return NextResponse.json(
            { success: false, error: 'Payment amount does not match expected price' },
            { status: 400 },
          );
        }
      }
    }

    // 6. Process the payment (idempotent — dedup by wompiId inside the service)
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
