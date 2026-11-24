/**
 * POST /api/calendar/select-calendar
 *
 * Saves the tutor's chosen Google Calendar(s) to their schedule.
 * This replaces the hardcoded "Disponibilidad" name requirement.
 *
 * In «busy» mode every selected calendar's events are subtracted (e.g. the
 * university calendar and the personal one); in «available» mode only the
 * first one is read.
 *
 * Auth: Bearer JWT (tutor approved)
 * Body: { calendarIds: string[] } (legacy: { calendarId: string, calendarName?: string })
 * Response 200: { success, calendarIds, calendarId }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const MAX_CALENDARS = 10;

export async function POST(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { calendarIds, calendarId } = body ?? {};
  const ids = Array.isArray(calendarIds) ? calendarIds : calendarId ? [calendarId] : [];

  if (
    ids.length === 0
    || ids.length > MAX_CALENDARS
    || !ids.every((id) => typeof id === 'string' && id.trim())
  ) {
    return NextResponse.json(
      { success: false, error: `calendarIds must hold 1 to ${MAX_CALENDARS} calendar ids` },
      { status: 400 },
    );
  }

  const uniqueIds = [...new Set(ids)];

  await availabilityService.upsertSchedule(auth.sub, {
    calendarSyncIds: uniqueIds,
    calendarSyncId: uniqueIds[0],
    calendarConnectedAt: new Date(),
  });

  return NextResponse.json({
    success: true,
    calendarIds: uniqueIds,
    calendarId: uniqueIds[0],
  });
}
