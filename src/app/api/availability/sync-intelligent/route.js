/**
 * Intelligent Sync API Route
 * POST /api/availability/sync-intelligent - Intelligently sync only new events
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as availabilityService from '../../../../lib/services/availability.service';
import * as calendarService from '../../../../lib/services/calendar.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

const CALENDAR_ACCESS_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 3600,
  sameSite: 'lax',
  path: '/',
};

/**
 * POST /api/availability/sync-intelligent
 * Body: { tutorId, calendarName?, daysAhead? }
 * Google OAuth tokens: httpOnly cookies (calendar_access_token / calendar_refresh_token)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, calendarName = 'Disponibilidad', daysAhead = 30 } = body;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const cookieAccess = cookieStore.get('calendar_access_token')?.value;
    const cookieRefresh = cookieStore.get('calendar_refresh_token')?.value;

    let accessToken;
    try {
      const resolved = await calendarService.getAccessTokenOrRefresh(cookieAccess, cookieRefresh);
      accessToken = resolved.accessToken;
      if (resolved.refreshed) {
        cookieStore.set('calendar_access_token', accessToken, CALENDAR_ACCESS_COOKIE);
      }
    } catch (tokenError) {
      return NextResponse.json(
        { success: false, error: tokenError.message || 'Google Calendar no conectado' },
        { status: 401 }
      );
    }

    const results = await availabilityService.intelligentSync(
      tutorId,
      accessToken,
      calendarName,
      daysAhead
    );

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/sync-intelligent:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error en sincronización inteligente',
      },
      { status: 500 }
    );
  }
}

