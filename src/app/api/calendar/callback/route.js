/**
 * GET /api/calendar/callback
 * OAuth callback from Google. Verifies CSRF state, exchanges code for tokens,
 * stores them in HttpOnly cookies, and redirects to the frontend.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/** Clear the CSRF state cookie after use (one-time token). */
function clearStateCookieHeader() {
  return [
    'calendar_oauth_state=',
    'Max-Age=0',
    'Path=/api/calendar/callback',
    'HttpOnly',
    'SameSite=Lax',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
  ].join('; ');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  // --- CSRF verification ---
  const cookieStore = await cookies();
  const expectedState = cookieStore.get('calendar_oauth_state')?.value;

  if (!expectedState || !stateParam || stateParam !== expectedState) {
    console.error('[calendar/callback] CSRF state mismatch');
    const response = NextResponse.redirect(
      `${FRONTEND_URL}/calendar-error?error=${encodeURIComponent('Invalid or missing state parameter')}`,
    );
    response.headers.set('Set-Cookie', clearStateCookieHeader());
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(
      `${FRONTEND_URL}/calendar-error?error=${encodeURIComponent('No authorization code provided')}`,
    );
    response.headers.set('Set-Cookie', clearStateCookieHeader());
    return response;
  }

  try {
    const tokens = await calendarService.exchangeCodeForTokens(code);

    cookieStore.set('calendar_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600,
      sameSite: 'lax',
      path: '/',
    });

    if (tokens.refresh_token) {
      cookieStore.set('calendar_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60,
        sameSite: 'lax',
        path: '/',
      });
    }

    const response = NextResponse.redirect(
      `${FRONTEND_URL}/tutor/disponibilidad?calendar_connected=true`,
    );
    response.headers.set('Set-Cookie', clearStateCookieHeader());
    return response;
  } catch (error) {
    console.error('[calendar/callback] Error exchanging code:', error);

    const response = NextResponse.redirect(
      `${FRONTEND_URL}/calendar-error?error=${encodeURIComponent('Error processing authorization')}`,
    );
    response.headers.set('Set-Cookie', clearStateCookieHeader());
    return response;
  }
}
