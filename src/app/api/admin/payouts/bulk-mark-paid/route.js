/**
 * POST /api/admin/payouts/bulk-mark-paid
 * Body: { paymentIds: string[], note?: string, accountId, paidAt?, proofS3Key }
 * One transfer for the batch: one account, one date, one proof.
 *
 * Mark a batch of payments as paid out to the tutor (e.g. the whole
 * weekly digest for one tutor).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';
import { financeErrorResponse, transferFields } from '../../finance/_shared';

const bodySchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un pago.'),
  note:       z.string().max(500).optional(),
  ...transferFields,
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 }); }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const { count } = await payoutsService.bulkMarkPayoutsAsPaid({
      paymentIds: parsed.data.paymentIds,
      adminId: auth.sub,
      note: parsed.data.note,
      accountId: parsed.data.accountId,
      paidAt: parsed.data.paidAt,
      proofS3Key: parsed.data.proofS3Key,
      request,
    });
    return NextResponse.json({ success: true, count });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/payouts/bulk-mark-paid');
  }
}
