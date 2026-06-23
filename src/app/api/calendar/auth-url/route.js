/**
 * GET /api/calendar/auth-url
 * Generates the Google OAuth URL for connecting Google Calendar.
 * Requires Calico authentication — only logged-in users may connect their calendar.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    // Generate a CSRF state token to bind this authorization request to the
    // user's session and prevent OAuth authorization code injection attacks.
    const csrfState = crypto.randomUUID();

    const authUrl = await calendarService.getAuthUrl(csrfState);

    // Store the CSRF token in a short-lived HttpOnly cookie so the callback
    // can verify it was initiated by this user's browser.
    const response = NextResponse.json({ success: true, authUrl });
    response.headers.set(
      'Set-Cookie',
      [
        `calendar_oauth_state=${csrfState}`,
        'Max-Age=600', // 10 minutes — enough to complete the OAuth flow
        'Path=/api/calendar/callback',
        'HttpOnly',
        'SameSite=Lax', // Lax required: Google redirects back via GET (cross-site navigation)
        ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
      ].join('; '),
    );
    return response;
  } catch (error) {
    console.error('[auth-url] Error generating auth URL:', error);
    return NextResponse.json(
      { success: false, error: 'Error generating auth URL' },
      { status: 500 },
    );
  }
}
