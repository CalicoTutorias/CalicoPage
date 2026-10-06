/**
 * /api/admin/events/[id]
 *
 * GET    — event detail (admin view, meetingUrl included) with its stats.
 * PATCH  — partial update. Price and early-bird lock once a registration
 *          exists; a Published event keeps its modality / autoMeet. Returns
 *          `calendarWarning: true` when the Meet could not be patched.
 * DELETE — Draft only; a Published event is cancelled instead.
 *
 * Auth: requireAdminUser on every verb. Mutations are audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import {
  eventErrorResponse,
  eventIdSchema,
  invalidBody,
  invalidEventId,
  updateEventSchema,
} from '../_schemas';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const event = await eventAdminService.getEventAdmin(id);
    return NextResponse.json({ success: true, event });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]');
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = updateEventSchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const result = await eventAdminService.updateEvent({
      adminId: auth.sub,
      id,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return eventErrorResponse(err, 'PATCH /api/admin/events/[id]');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    await eventAdminService.deleteDraftEvent({ adminId: auth.sub, id, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    return eventErrorResponse(err, 'DELETE /api/admin/events/[id]');
  }
}
