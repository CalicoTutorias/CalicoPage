/**
 * GET /api/calendar/events
 * List events from the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

export async function GET(request) {
  const auth = authenticateRequest(request);
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

    const cookieStore = await cookies();
    const accessToken = cookieStore.get('calendar_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Google Calendar connection found' },
        { status: 401 },
      );
    }

    const events = await calendarService.listEvents(accessToken, calendarId, timeMin, timeMax);

    return NextResponse.json({ success: true, events, totalEvents: events.length });
  } catch (error) {
    console.error('[calendar/events] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error listing events' },
      { status: 500 },
    );
  }
}
