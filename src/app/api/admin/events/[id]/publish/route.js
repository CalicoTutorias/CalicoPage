/**
 * POST /api/admin/events/[id]/publish
 *
 * Publish a Draft: validates everything, requires a future start and, with
 * autoMeet, creates the Google Meet on the central calendar first. A calendar
 * failure → 502 CALENDAR_ERROR and the event stays Draft.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
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
    const event = await eventAdminService.publishEvent({ adminId: auth.sub, id, request });
    return NextResponse.json({ success: true, event });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/publish');
  }
}
