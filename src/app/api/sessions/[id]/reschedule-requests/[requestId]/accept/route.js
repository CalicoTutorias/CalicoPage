/**
 * POST /api/sessions/:id/reschedule-requests/:requestId/accept — Accept a proposal
 *
 * Auth: required, only the person the proposal was made to (the tutor for a
 * student's proposal, the student who booked for the tutor's).
 *
 * The session moves to the proposed time with the same duration, payment,
 * Meet and Calendar event. Answers { session, calendar }, where `calendar` is
 * 'updated' | 'failed' | 'none': the session moved in any case, and 'failed'
 * means the calendar event still shows the old time.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as rescheduleService from '@/lib/services/session-reschedule.service';
import { rescheduleErrorResponse } from '@/lib/api/reschedule-response';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  const limited = rateLimit(`reschedule-answer:${userId}`, { max: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const { id, requestId } = await params;
  try {
    const { session, calendar } = await rescheduleService.accept({ sessionId: id, requestId, userId });
    // Only the new time travels back: the caller re-reads the session through
    // its own (role-scoped) endpoint.
    return NextResponse.json({
      success: true,
      session: { id: session.id, startTimestamp: session.startTimestamp, endTimestamp: session.endTimestamp },
      calendar,
    });
  } catch (err) {
    return rescheduleErrorResponse(err, 'POST /api/sessions/:id/reschedule-requests/:requestId/accept');
  }
}
