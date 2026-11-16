/**
 * GET /api/admin/events/[id]/payments
 *
 * Payments of an event (including the refund queue and anomaly flags) and totals.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../_schemas';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const { payments, totals } = await eventAdminService.getEventPaymentsAdmin(id);
    return NextResponse.json({ success: true, payments, totals });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]/payments');
  }
}
