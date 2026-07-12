/**
 * POST /api/calendar/select-calendar
 *
 * Saves the tutor's chosen Google Calendar ID to their schedule.
 * This replaces the hardcoded "Disponibilidad" name requirement.
 *
 * Auth: Bearer JWT (tutor approved)
 * Body: { calendarId: string, calendarName: string }
 * Response 200: { success, calendarId, calendarName }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

export async function POST(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { calendarId, calendarName } = body ?? {};

  if (!calendarId || typeof calendarId !== 'string') {
    return NextResponse.json(
      { success: false, error: 'calendarId is required' },
      { status: 400 },
    );
  }

  await availabilityService.upsertSchedule(auth.sub, { calendarSyncId: calendarId });

  return NextResponse.json({
    success: true,
    calendarId,
    calendarName: calendarName ?? calendarId,
  });
}
