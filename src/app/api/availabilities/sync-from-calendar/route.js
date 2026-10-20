/**
 * POST /api/availabilities/sync-from-calendar
 *
 * Reads the tutor's selected Google Calendar and replaces their
 * `calendar_sync` availability blocks to match it.
 *
 * Auth: Bearer JWT (tutor approved)
 * Calendar tokens: persisted, encrypted credential (`calendar-credential.service`)
 *
 * Response 200: { success, synced, removed, skipped, total, calendarName }
 * Response 400: no calendar connection (code CALENDAR_NOT_CONNECTED)
 * Response 401: Google rejected the stored credential (code CALENDAR_REAUTH_REQUIRED)
 * Response 403: not an approved tutor
 * Response 404: no calendar found on the account (code CALENDAR_NOT_FOUND)
 * Response 503: server has no CALENDAR_TOKEN_ENCRYPTION_KEY
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';
import { calendarAuthErrorResponse } from '@/lib/http/calendar-errors';

export async function POST(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await availabilityService.syncAvailabilityFromCalendar(auth.sub);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const authResponse = calendarAuthErrorResponse(err);
    if (authResponse) return authResponse;

    if (err.code === 'CALENDAR_NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message, code: 'CALENDAR_NOT_FOUND' },
        { status: 404 },
      );
    }

    console.error('[sync-from-calendar] Unexpected error:', err);
    throw err;
  }
}
