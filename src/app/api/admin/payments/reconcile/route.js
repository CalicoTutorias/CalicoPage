/**
 * POST /api/admin/payments/reconcile
 * Body: { transactionId?: string, reference?: string } — at least one.
 *
 * Replay an approved Wompi transaction that never produced its payment +
 * session because Wompi's API was unreachable while confirm-payment / the
 * webhook tried to verify it. The transaction is re-fetched from Wompi and
 * run through the standard reconcile + fulfil contract; a transaction that
 * was already processed answers ALREADY_PROCESSED and books nothing.
 *
 * With only `reference`, the transaction id pinned on the intent by
 * confirm-payment (`metadata.pendingTransactionId`) is used.
 * Runbook: docs/ops/payments-recovery.md
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as reconcileService from '@/lib/services/payment-reconcile.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const bodySchema = z
  .object({
    transactionId: z.string().trim().min(1).max(120).optional(),
    reference: z.string().trim().min(1).max(120).optional(),
  })
  .refine((b) => b.transactionId || b.reference, {
    message: 'transactionId or reference is required',
  });

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  INTENT_NOT_FOUND: 404,
  NO_PENDING_TRANSACTION: 404,
  TRANSACTION_NOT_FOUND: 404,
  PROVIDER_UNAVAILABLE: 503,
  AMOUNT_MISMATCH: 409,
  SESSION_CONFLICT: 409,
  OUTSIDE_AVAILABILITY: 409,
  MAX_SESSIONS_REACHED: 409,
  COUPON_LIMIT_EXCEEDED: 409,
  INTENT_CONSUMED: 409,
};

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body = {};
  try { body = await request.json(); } catch { /* validated below */ }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const result = await reconcileService.reconcileTransaction(parsed.data);

    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.PAYMENT_RECONCILE,
      targetType: 'PaymentIntent',
      targetId: result.reference ?? parsed.data.reference ?? null,
      payload: {
        input: parsed.data,
        outcome: result.outcome,
        transactionId: result.transactionId,
        status: result.status,
        amountInCents: result.amountInCents,
        sessionId: result.sessionId ?? null,
        paymentId: result.paymentId ?? null,
        registrationId: result.registrationId ?? null,
      },
      request,
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const status = STATUS_BY_CODE[err.code];
    if (status) {
      return NextResponse.json(
        { success: false, error: err.code, message: err.message },
        { status },
      );
    }
    console.error('[POST /api/admin/payments/reconcile]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
