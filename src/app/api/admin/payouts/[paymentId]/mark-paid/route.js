/**
 * POST /api/admin/payouts/[paymentId]/mark-paid
 * Body: { note?: string, accountId, paidAt?, proofS3Key }
 * The transfer needs its account and proof (finance ledger) unless it was
 * made before the ledger's cutoff date.
 *
 * Flag a single payment as paid out to the tutor. Idempotent.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';
import { financeErrorResponse, transferFields } from '../../../finance/_shared';

const bodySchema = z.object({
  note: z.string().max(500).optional(),
  ...transferFields,
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { paymentId } = await params;
  if (!paymentId) {
    return NextResponse.json({ success: false, error: 'INVALID_PAYMENT_ID' }, { status: 400 });
  }

  let body = {};
  try { body = await request.json(); } catch { /* allow empty body */ }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const payment = await payoutsService.markPayoutAsPaid({
      paymentId,
      adminId: auth.sub,
      note: parsed.data.note,
      accountId: parsed.data.accountId,
      paidAt: parsed.data.paidAt,
      proofS3Key: parsed.data.proofS3Key,
      request,
    });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    return financeErrorResponse(err, 'POST /api/admin/payouts/[paymentId]/mark-paid');
  }
}
