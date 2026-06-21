/**
 * GET /api/calendar/list
 * List the authenticated user's connected Google Calendars.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('calendar_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Google Calendar connection found' },
        { status: 401 },
      );
    }

    const calendars = await calendarService.listCalendars(accessToken);

    return NextResponse.json({ success: true, calendars });
  } catch (error) {
    console.error('[calendar/list] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error listing calendars' },
      { status: 500 },
    );
  }
}
