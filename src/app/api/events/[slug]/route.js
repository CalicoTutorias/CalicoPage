/**
 * GET /api/events/[slug] — the public event page data.
 *
 * Auth optional (tryAuthenticateRequest): a logged-in viewer also gets
 * `myRegistration` (meetingUrl only when Confirmed). The response is
 * personalised, so it is never cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tryAuthenticateRequest } from '@/lib/auth/middleware';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from '../_errors';

export async function GET(request, { params }) {
  const auth = await tryAuthenticateRequest(request);
  const { slug } = await params;

  try {
    const { event, myRegistration } = await eventService.getPublicEvent({ slug, viewerId: auth?.sub ?? null });
    return NextResponse.json(
      { success: true, event, myRegistration },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events/[slug]');
  }
}
