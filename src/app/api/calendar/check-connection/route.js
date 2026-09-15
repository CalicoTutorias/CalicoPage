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
    let refreshed = false;
    if (accessToken) {
      try {
        await calendarService.listCalendars(accessToken);
        isValid = true;
      } catch {
        isValid = false;
      }
    }

    // El access token de Google caduca en una hora. Antes esta ruta solo lo
    // probaba y, al fallar, la UI pasaba a «expirado»: desactivaba el botón de
    // sincronizar y en modo «ocupado» dejaba de recalcular tras cada edición,
    // aunque el refresh token seguía siendo válido y el sync sí funcionaba.
    // Ahora se renueva aquí mismo y se reescribe la cookie, igual que hace
    // POST /api/calendar/refresh-token.
    if (!isValid && refreshToken) {
      try {
        const newTokens = await calendarService.refreshAccessToken(refreshToken);
        if (newTokens?.access_token) {
          cookieStore.set('calendar_access_token', newTokens.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 3600,
            sameSite: 'lax',
            path: '/',
          });
          isValid = true;
          refreshed = true;
        }
      } catch (error) {
        console.warn('[check-connection] no se pudo renovar el token de Google:', error?.message);
      }
    }

    const connected = isValid && (!!accessToken || refreshed);

    return NextResponse.json({
      connected,
      hasAccessToken: !!accessToken || refreshed,
      hasRefreshToken: !!refreshToken,
      tokenValid: isValid,
      refreshed,
    });
  } catch (error) {
    console.error('[check-connection] Error:', error);
    return NextResponse.json(
      { connected: false, hasAccessToken: false, hasRefreshToken: false, tokenValid: false },
      { status: 500 },
    );
  }
}
