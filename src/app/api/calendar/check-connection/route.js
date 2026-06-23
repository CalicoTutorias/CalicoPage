/**
 * GET /api/calendar/check-connection
 * Returns the Google Calendar connection status for the authenticated user.
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
    const refreshToken = cookieStore.get('calendar_refresh_token')?.value;

    let isValid = false;
    if (accessToken) {
      try {
        await calendarService.listCalendars(accessToken);
        isValid = true;
      } catch {
        isValid = false;
      }
    }

    return NextResponse.json({
      connected: !!accessToken && isValid,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      tokenValid: isValid,
    });
  } catch (error) {
    console.error('[check-connection] Error:', error);
    return NextResponse.json(
      { connected: false, hasAccessToken: false, hasRefreshToken: false, tokenValid: false },
      { status: 500 },
    );
  }
}
