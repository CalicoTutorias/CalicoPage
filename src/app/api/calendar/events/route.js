/**
 * GET /api/calendar/events
 * List events from the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '@/lib/services/calendar.service';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';
import { calendarAuthErrorResponse } from '@/lib/http/calendar-errors';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');
    const timeMin = searchParams.get('timeMin');
    const timeMax = searchParams.get('timeMax');

    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: 'calendarId is required' },
        { status: 400 },
      );
    }

    const { accessToken } = await calendarCredentialService.getAccessToken(auth.sub);

    const events = await calendarService.listEvents(accessToken, calendarId, timeMin, timeMax);

    return NextResponse.json({ success: true, events, totalEvents: events.length });
  } catch (error) {
    const authResponse = calendarAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[calendar/events] failed', { code: error?.code || 'CALENDAR_LIST_EVENTS_FAILED' });
    return NextResponse.json(
      { success: false, error: 'Error listing events' },
      { status: 500 },
    );
  }
}
