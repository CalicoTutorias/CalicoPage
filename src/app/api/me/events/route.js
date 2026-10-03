/**
 * GET /api/me/events — the caller's Confirmed and Canceled event
 * registrations, each with the public event summary.
 * Auth: authenticateRequest; the user is always auth.sub.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from '../../events/_errors';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const registrations = await eventService.getMyEvents(auth.sub);
    return NextResponse.json({ success: true, registrations });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/me/events');
  }
}
