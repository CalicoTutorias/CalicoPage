/**
 * POST /api/availabilities/sync-from-calendar
 *
 * Reads the tutor's "Disponibilidad" Google Calendar and replaces their
 * DB availability blocks to match it exactly.
 *
 * Auth: Bearer JWT (tutor approved)
 * Calendar tokens: httpOnly cookies (calendar_access_token / calendar_refresh_token)
 *
 * Response 200: { success, synced, removed, skipped, total, calendarName }
 * Response 400: no calendar connection
 * Response 401: calendar session expired
 * Response 403: not an approved tutor
 * Response 404: "Disponibilidad" calendar not found
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

export async function POST(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const cookieStore = await cookies();
  const accessToken  = cookieStore.get('calendar_access_token')?.value;
  const refreshToken = cookieStore.get('calendar_refresh_token')?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json(
      { success: false, error: 'Conecta tu Google Calendar antes de sincronizar.' },
      { status: 400 },
    );
  }

  try {
    const result = await availabilityService.syncAvailabilityFromCalendar(
      auth.sub,
      accessToken,
      refreshToken,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'CALENDAR_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message, code: 'CALENDAR_NOT_FOUND' },
        { status: 404 },
      );
    }

    if (
      err.message?.includes('session expired') ||
      err.message?.includes('No Google Calendar') ||
      err.message?.includes('Could not refresh')
    ) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 401 },
      );
    }

    console.error('[sync-from-calendar] Unexpected error:', err);
    throw err;
  }
}
