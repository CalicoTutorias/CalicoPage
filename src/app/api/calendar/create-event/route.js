/**
 * Create Calendar Event API Route
 * POST /api/calendar/create-event - Create an event in a calendar
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * POST /api/calendar/create-event
 * Body: { calendarId, summary, start, end, description?, location? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { calendarId, summary, description, start, end, attendees, ...event } = body;

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

    const eventData = {
      summary,
      description,
      start: { dateTime: start, timeZone: 'America/Bogota' },
      end: { dateTime: end, timeZone: 'America/Bogota' },
      attendees: [{email: 'danielkmiloq@gmail.com'}, {email: 'rodriguezkat30@gmail.com'}],

      // Meeting configuration
      conferenceData: {
        createRequest: {
          requestId: `calico-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        }
      }
    }

    const createdEvent = await calendarService.createEvent(accessToken, calendarId, event);

    return NextResponse.json({
      success: true,
      event: createdEvent,
    });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error creating event',
      },
      { status: 500 }
    );
  }
}

