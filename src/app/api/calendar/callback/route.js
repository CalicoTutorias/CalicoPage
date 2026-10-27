/**
 * GET /api/calendar/callback
 * OAuth callback from Google. Verifies the signed state against the nonce
 * cookie, exchanges the code for tokens, stores them encrypted in the DB for
 * the user named in the state, and redirects to the frontend.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyOAuthState } from '@/lib/auth/oauth-state';
import * as calendarService from '@/lib/services/calendar.service';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';
import { clearLegacyCalendarCookies } from '@/lib/http/legacy-calendar-cookies';

const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const STATE_COOKIE = 'calendar_oauth_state';

/** The nonce cookie is single-use: cleared on every outcome. */
function withStateCookieCleared(response) {
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    sameSite: 'lax',
    path: '/api/calendar/callback',
  });
  return response;
}

function redirectWithError(message) {
  return withStateCookieCleared(
    NextResponse.redirect(`${FRONTEND_URL}/calendar-error?error=${encodeURIComponent(message)}`),
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(STATE_COOKIE)?.value;

  const userId = verifyOAuthState(stateParam, expectedNonce);
  if (!userId) {
    console.error('[calendar/callback] CSRF state mismatch');
    return redirectWithError('Invalid or missing state parameter');
  }

  if (!code) {
    return redirectWithError('No authorization code provided');
  }

  try {
    const tokens = await calendarService.exchangeCodeForTokens(code);
    await calendarCredentialService.saveFromOAuth(userId, tokens);

    const response = NextResponse.redirect(
      `${FRONTEND_URL}/tutor/disponibilidad?calendar_connected=true`,
    );
    // Los tokens ya no viven en el navegador: limpiar los de instalaciones anteriores.
    clearLegacyCalendarCookies(response);
    return withStateCookieCleared(response);
  } catch (error) {
    console.error('[calendar/callback] OAuth code exchange failed', {
      status: error?.code ?? error?.response?.status ?? 'unknown',
    });
    return redirectWithError('Error processing authorization');
  }
}
