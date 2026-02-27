/**
 * List Calendars API Route
 * GET /api/calendar/list - List connected calendars
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/list
 */
export async function GET(request) {
  try {
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

    const calendars = await calendarService.listCalendars(accessToken);

    return NextResponse.json({
      success: true,
      calendars,
    });
  } catch (error) {
    console.error('Error listing calendars:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error listing calendars',
      },
      { status: 500 }
    );
  }
}

