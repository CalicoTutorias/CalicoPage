/**
 * GET /api/calendar/callback
 * OAuth callback from Google. Verifies CSRF state, exchanges code for tokens,
 * stores them in HttpOnly cookies, and redirects to the frontend.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function clearStateCookie(response) {
  response.cookies.set('calendar_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    sameSite: 'lax',
    path: '/api/calendar/callback',
  });
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
    clearStateCookie(response);
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(
      `${FRONTEND_URL}/calendar-error?error=${encodeURIComponent('No authorization code provided')}`,
    );
    clearStateCookie(response);
    return response;
  }

  try {
    const tokens = await calendarService.exchangeCodeForTokens(code);

    const response = NextResponse.redirect(
      `${FRONTEND_URL}/tutor/disponibilidad?calendar_connected=true`,
    );

    response.cookies.set('calendar_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600,
      sameSite: 'lax',
      path: '/',
    });

    if (tokens.refresh_token) {
      response.cookies.set('calendar_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60,
        sameSite: 'lax',
        path: '/',
      });
    }

    clearStateCookie(response);
    return response;
  } catch (error) {
    console.error('[calendar/callback] Error exchanging code:', error);

    const response = NextResponse.redirect(
      `${FRONTEND_URL}/calendar-error?error=${encodeURIComponent('Error processing authorization')}`,
    );
    clearStateCookie(response);
    return response;
  }
}
