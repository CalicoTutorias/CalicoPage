/**
 * GET /api/me/pending-feedback — the one feedback item the home popup should
 * show (spec §6.2): an unanswered event survey first, else an unrated
 * tutoring-session review, else null.
 * Auth: authenticateRequest; the user is always auth.sub. Never cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as eventSurveyService from '@/lib/services/event-survey.service';
import { eventsErrorResponse } from '../../events/_errors';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const item = await eventSurveyService.getPendingFeedback(auth.sub);
    return NextResponse.json({ success: true, item }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/me/pending-feedback');
  }
}
