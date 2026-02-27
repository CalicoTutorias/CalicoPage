/**
 * Calendar Auth URL API Route
 * GET /api/calendar/auth-url - Get Google OAuth URL as JSON (for API clients)
 */

import { NextResponse } from 'next/server';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * GET /api/calendar/auth-url
 * Query params: format (optional, set to 'json' for JSON callback)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    const authUrl = await calendarService.getAuthUrl(format === 'json' ? 'json' : undefined);
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';

    return NextResponse.json({
      success: true,
      authUrl,
      redirectUri,
      message: 'Visit the authUrl to authorize Google Calendar access',
      instructions: format === 'json'
        ? 'After authorization, add ?format=json to the callback URL to get tokens as JSON'
        : 'After authorization, you will be redirected to the callback URL',
      callbackUrl: redirectUri,
      note: format === 'json'
        ? 'IMPORTANT: When Google redirects you, manually add ?format=json to the URL to get JSON response'
        : undefined,
    });
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

