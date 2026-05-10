/**
 * POST /api/admin/payouts/[paymentId]/mark-paid
 * Body: { note?: string }
 *
 * Flag a single payment as paid out to the tutor. Idempotent.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';

const bodySchema = z.object({
  note: z.string().max(500).optional(),
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
      request,
    });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'INVALID_INPUT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/payouts/[paymentId]/mark-paid]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
