/**
 * Check Calendar Connection API Route
 * GET /api/calendar/check-connection - Check calendar connection status
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/check-connection
 */
export async function GET(request) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('calendar_access_token')?.value;
    const refreshToken = cookieStore.get('calendar_refresh_token')?.value;

    // If we have an access token, try to validate it
    let isValid = false;
    if (accessToken) {
      try {
        // Try to list calendars to verify token is valid
        await calendarService.listCalendars(accessToken);
        isValid = true;
      } catch (error) {
        // Token exists but is invalid/expired
        isValid = false;
      }
    }

    return NextResponse.json({
      connected: !!accessToken && isValid,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      tokenValid: isValid,
      tokenSource: accessToken ? 'cookie' : 'none',
    });
  } catch (error) {
    console.error('Error checking connection:', error);
    return NextResponse.json(
      {
        connected: false,
        hasAccessToken: false,
        hasRefreshToken: false,
        tokenValid: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

