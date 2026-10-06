/**
 * POST /api/admin/events/[id]/remind
 *
 * Email the event reminder to every Confirmed registrant. Refused (429
 * REMINDER_COOLDOWN) while the previous reminder is under 1 h old; 503 while
 * the Brevo template is not configured; 409 for a Draft, Canceled or ended event.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventSurveyService from '@/lib/services/event-survey.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../_schemas';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const { sent, failed } = await eventSurveyService.sendEventReminder({ eventId: id, adminId: auth.sub, request });
    return NextResponse.json({ success: true, sent, failed });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/remind');
  }
}
