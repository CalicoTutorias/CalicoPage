/**
 * DELETE /api/calendar/delete-event
 * Delete an event from the authenticated user's Google Calendar.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '@/lib/services/calendar.service';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';
import { calendarAuthErrorResponse } from '@/lib/http/calendar-errors';

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

    const { accessToken } = await calendarCredentialService.getAccessToken(auth.sub);

    await calendarService.deleteEvent(accessToken, calendarId, eventId);

    return NextResponse.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    const authResponse = calendarAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[calendar/delete-event] failed', { code: error?.code || 'CALENDAR_DELETE_EVENT_FAILED' });
    return NextResponse.json(
      { success: false, error: 'Error deleting event' },
      { status: 500 },
    );
  }
}
