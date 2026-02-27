/**
 * Delete Calendar Event API Route
 * DELETE /api/calendar/delete-event - Delete an event from a calendar
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * DELETE /api/calendar/delete-event
 * Query params: calendarId (required), eventId (required)
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');
    const eventId = searchParams.get('eventId');

    if (!calendarId || !eventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'calendarId and eventId are required',
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

    await calendarService.deleteEvent(accessToken, calendarId, eventId);

    return NextResponse.json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error deleting event',
      },
      { status: 500 }
    );
  }
}

