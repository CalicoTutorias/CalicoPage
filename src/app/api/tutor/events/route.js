/**
 * GET /api/tutor/events — the Published and Canceled events the caller
 * tutors, with the meeting link and the confirmed headcount.
 * Auth: requireTutor; the tutor is always auth.sub.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from '../../events/_errors';

export async function GET(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const events = await eventService.getTutorEvents(auth.sub);
    return NextResponse.json({ success: true, events });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/tutor/events');
  }
}
