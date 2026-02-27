/**
 * Calendar Events API Route
 * GET /api/calendar/events - List events from a calendar
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/events
 * Query params: calendarId (required), timeMin (optional), timeMax (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');
    const timeMin = searchParams.get('timeMin');
    const timeMax = searchParams.get('timeMax');

    if (!calendarId) {
      return NextResponse.json(
        {
          success: false,
          error: 'calendarId is required',
        },
        { status: 400 }
      );
    }

    const cookieStore = cookies();
    const accessToken = cookieStore.get('calendar_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Google Calendar connection found',
        },
        { status: 401 }
      );
    }

    const events = await calendarService.listEvents(accessToken, calendarId, timeMin, timeMax);

    return NextResponse.json({
      success: true,
      events,
      totalEvents: events.length,
    });
  } catch (error) {
    console.error('Error listing events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error listing events',
      },
      { status: 500 }
    );
  }
}

