/**
 * POST /api/admin/payments/record-external-charge
 * Body: { wompiId: string, paymentId?: string, sessionId?: string } — one of
 * paymentId / sessionId identifies the payment.
 *
 * Convert a courtesy payment (booked with a 100 % coupon: amount 0, no Wompi
 * id) into the real charge, because the money WAS collected by Wompi under
 * `wompiId` — e.g. an approved payment lost during a provider outage whose
 * student was re-booked with a courtesy coupon. The transaction is verified
 * against Wompi (APPROVED, amount = list price) before anything changes; the
 * payment row becomes amount = list price, no discount, linked to the Wompi
 * id, and the coupon redemption is released so the coupon does not count as
 * a discount Calico absorbed. Audited as PAYMENT_EXTERNAL_CHARGE.
 * Runbook: docs/ops/payments-recovery.md
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as externalChargeService from '@/lib/services/payment-external-charge.service';

const bodySchema = z
  .object({
    wompiId: z.string().trim().min(1).max(120),
    paymentId: z.string().trim().min(1).max(120).optional(),
    sessionId: z.string().trim().min(1).max(120).optional(),
  })
  .refine((b) => b.paymentId || b.sessionId, { message: 'paymentId or sessionId is required' });

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  TRANSACTION_NOT_FOUND: 404,
  ALREADY_CHARGED: 409,
  NOT_COURTESY: 409,
  WOMPI_ID_IN_USE: 409,
  NOT_APPROVED: 409,
  AMOUNT_MISMATCH: 409,
  PROVIDER_UNAVAILABLE: 503,
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
    const result = await externalChargeService.recordExternalCharge({
      ...parsed.data,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const status = STATUS_BY_CODE[err.code];
    if (status) {
      return NextResponse.json({ success: false, error: err.code, message: err.message }, { status });
    }
    console.error('[POST /api/admin/payments/record-external-charge]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
