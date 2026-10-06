/**
 * POST /api/admin/events/[id]/payments/[paymentId]/refunded
 *
 * Mark a Pending refund as done (the money was returned outside the platform).
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../../../_schemas';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id, paymentId } = await params;
  if (!eventIdSchema.safeParse(id).success || !eventIdSchema.safeParse(paymentId).success) return invalidEventId();

  try {
    const payment = await eventAdminService.markPaymentRefunded({ adminId: auth.sub, eventId: id, paymentId, request });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/payments/[paymentId]/refunded');
  }
}
