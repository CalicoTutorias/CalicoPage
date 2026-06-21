/**
 * POST /api/calendar/create-event
 * Create an event in the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

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

    const cookieStore = await cookies();
    const accessToken = cookieStore.get('calendar_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Google Calendar connection found' },
        { status: 401 },
      );
    }

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
    console.error('[create-event] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error creating event' },
      { status: 500 },
    );
  }
}
