/**
 * GET /api/calendar/auth-url
 * Generates the Google OAuth URL for connecting Google Calendar.
 * Requires Calico authentication — only logged-in users may connect their calendar.
 *
 * The `state` sent to Google is a short-lived JWT bound to the user (see
 * `src/lib/auth/oauth-state.js`); its nonce also travels in an HttpOnly cookie
 * so the callback can tell the request came from this browser.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { createOAuthState } from '@/lib/auth/oauth-state';
import * as calendarService from '@/lib/services/calendar.service';

export const OAUTH_STATE_COOKIE = 'calendar_oauth_state';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { state, nonce } = createOAuthState(auth.sub);
    const authUrl = await calendarService.getAuthUrl(state);

    const response = NextResponse.json({ success: true, authUrl });
    response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600, // 10 minutes — enough to complete the OAuth flow
      sameSite: 'lax', // Lax required: Google redirects back via GET (cross-site navigation)
      path: '/api/calendar/callback',
    });
    return response;
  } catch (error) {
    console.error('[calendar/auth-url] failed', { code: error?.code || 'CALENDAR_AUTH_URL_FAILED' });
    return NextResponse.json(
      { success: false, error: 'Error generating auth URL' },
      { status: 500 },
    );
  }
}
