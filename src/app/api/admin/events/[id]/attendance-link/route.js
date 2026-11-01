/**
 * POST   /api/admin/events/[id]/attendance-link — open the private attendance
 *        link of a free event that already took place (idempotent).
 * DELETE /api/admin/events/[id]/attendance-link — close it.
 *
 * Both return the event, whose `attendanceCode` is null when the link is closed.
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../_schemas';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const event = await eventAdminService.openAttendanceLink({ adminId: auth.sub, id, request });
    return NextResponse.json({ success: true, event });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/attendance-link');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const event = await eventAdminService.closeAttendanceLink({ adminId: auth.sub, id, request });
    return NextResponse.json({ success: true, event });
  } catch (err) {
    return eventErrorResponse(err, 'DELETE /api/admin/events/[id]/attendance-link');
  }
}
