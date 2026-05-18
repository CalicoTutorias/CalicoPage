/**
 * POST /api/admin/payouts/bulk-mark-paid
 * Body: { paymentIds: string[], note?: string }
 *
 * Mark a batch of payments as paid out to the tutor (e.g. the whole
 * weekly digest for one tutor).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';

const bodySchema = z.object({
  paymentIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos un pago.'),
  note:       z.string().max(500).optional(),
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
      request,
    });
    return NextResponse.json({ success: true, count });
  } catch (err) {
    if (err.code === 'INVALID_INPUT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/payouts/bulk-mark-paid]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
