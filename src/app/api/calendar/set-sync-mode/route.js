/**
 * POST /api/calendar/set-sync-mode
 *
 * Saves the tutor's chosen calendar sync mode to their schedule.
 *   "available" — events in the selected calendar = times the tutor IS free
 *   "busy"      — events = busy blocks; Calico subtracts them from manual blocks
 *
 * Auth: Bearer JWT (tutor approved)
 * Body: { mode: "available" | "busy" }
 * Response 200: { success, mode }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const VALID_MODES = ['available', 'busy'];

export async function POST(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { mode } = body ?? {};

  if (!mode || !VALID_MODES.includes(mode)) {
    return NextResponse.json(
      { success: false, error: `mode must be one of: ${VALID_MODES.join(', ')}` },
      { status: 400 },
    );
  }

  await availabilityService.upsertSchedule(auth.sub, { calendarSyncMode: mode });

  return NextResponse.json({ success: true, mode });
}
