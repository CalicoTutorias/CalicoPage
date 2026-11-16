/**
 * POST /api/admin/events/[id]/payments/[paymentId]/refunded
 *
 * Mark a Pending refund as done (the money was returned outside the platform).
 * Body: { amount?: int (partial; default all), accountId, refundedAt?, proofS3Key }
 * — the account the money left and its proof, for the finance ledger.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../../../_schemas';

const bodySchema = z.object({
  amount: z.number().int().positive().nullish(),
  accountId: z.string().uuid().optional(),
  refundedAt: z.string().datetime({ offset: true }).optional(),
  proofS3Key: z.string().max(200).optional(),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id, paymentId } = await params;
  if (!eventIdSchema.safeParse(id).success || !eventIdSchema.safeParse(paymentId).success) return invalidEventId();

  let raw = {};
  try { raw = await request.json(); } catch { /* empty body: full refund, default account */ }
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) return invalidBody(parsed);

  try {
    const payment = await eventAdminService.markPaymentRefunded({
      adminId: auth.sub, eventId: id, paymentId, ...parsed.data, amount: parsed.data.amount ?? null, request,
    });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/payments/[paymentId]/refunded');
  }
}
