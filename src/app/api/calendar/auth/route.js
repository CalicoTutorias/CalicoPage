/**
 * Calendar Auth API Route
 * GET /api/calendar/auth - Redirect to Google OAuth
 */

import { NextResponse } from 'next/server';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/auth
 * Redirects to Google Calendar authorization page
 */
export async function GET(request) {
  try {
    const authUrl = await calendarService.getAuthUrl();
    return NextResponse.redirect(authUrl);
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

