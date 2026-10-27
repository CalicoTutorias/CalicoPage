/**
 * POST /api/calendar/create-event
 * Create an event in the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '@/lib/services/calendar.service';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';
import { calendarAuthErrorResponse } from '@/lib/http/calendar-errors';

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { calendarId, summary, description, start, end, location } = body;

    if (!calendarId) {
      return NextResponse.json(
        { success: false, error: 'calendarId is required' },
        { status: 400 },
      );
    }

    const { accessToken } = await calendarCredentialService.getAccessToken(auth.sub);

    const eventData = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'America/Bogota' },
      end: { dateTime: end, timeZone: 'America/Bogota' },
      ...(location ? { location } : {}),
      conferenceData: {
        createRequest: {
          requestId: `calico-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const createdEvent = await calendarService.createEvent(accessToken, calendarId, eventData);

    return NextResponse.json({ success: true, event: createdEvent });
  } catch (error) {
    const authResponse = calendarAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[calendar/create-event] failed', { code: error?.code || 'CALENDAR_CREATE_EVENT_FAILED' });
    return NextResponse.json(
      { success: false, error: 'Error creating event' },
      { status: 500 },
    );
  }
}
