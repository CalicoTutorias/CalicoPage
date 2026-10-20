/**
 * GET /api/calendar/list
 * List the authenticated user's connected Google Calendars.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '@/lib/services/calendar.service';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';
import { calendarAuthErrorResponse } from '@/lib/http/calendar-errors';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { accessToken } = await calendarCredentialService.getAccessToken(auth.sub);

    const calendars = await calendarService.listCalendars(accessToken);

    return NextResponse.json({ success: true, calendars });
  } catch (error) {
    const authResponse = calendarAuthErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('[calendar/list] failed', { code: error?.code || 'CALENDAR_LIST_FAILED' });
    return NextResponse.json(
      { success: false, error: 'Error listing calendars' },
      { status: 500 },
    );
  }
}
