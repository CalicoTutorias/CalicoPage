/**
 * DELETE /api/calendar/delete-event
 * Delete an event from the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

export async function DELETE(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const calendarId = searchParams.get('calendarId');
    const eventId = searchParams.get('eventId');

    if (!calendarId || !eventId) {
      return NextResponse.json(
        { success: false, error: 'calendarId and eventId are required' },
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

    await calendarService.deleteEvent(accessToken, calendarId, eventId);

    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('[delete-event] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error deleting event' },
      { status: 500 },
    );
  }
}
