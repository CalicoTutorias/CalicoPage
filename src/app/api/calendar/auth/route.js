/**
 * Calendar Auth API Route
 * GET /api/calendar/auth - Redirect to Google OAuth
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/auth
 * Redirects to Google Calendar authorization page
 */
export async function GET(request) {
  try {
    const csrfState = crypto.randomUUID();
    const authUrl = await calendarService.getAuthUrl(csrfState);
    const response = NextResponse.redirect(authUrl);

    response.cookies.set('calendar_oauth_state', csrfState, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600,
      sameSite: 'lax',
      path: '/api/calendar/callback',
    });

    return response;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error generating auth URL',
      },
      { status: 500 }
    );
  }
}
