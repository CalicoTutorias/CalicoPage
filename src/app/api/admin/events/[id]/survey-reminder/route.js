/**
 * POST /api/admin/events/[id]/survey-reminder
 *
 * Email the survey reminder to Confirmed registrants of an ended event who
 * have not answered and were not reminded in the last 24 h. 409 while the
 * event has not ended (or is not Published); 503 while the Brevo template is
 * not configured.
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
    const { sent, failed, skipped } = await eventSurveyService.sendSurveyReminders({
      eventId: id,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, sent, failed, skipped });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/survey-reminder');
  }
}
