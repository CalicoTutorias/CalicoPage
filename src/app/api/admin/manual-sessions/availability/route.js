/**
 * GET /api/admin/manual-sessions/availability?tutorId=
 * Slots the manual-session form may offer for this tutor: published blocks,
 * minus sessions (with buffer) and full days, from now on.
 *
 * Auth: requireAdminUser.
 * Returns: { success: true, timeZone, days: [{ date, slots: [{ startTimestamp, time, durations }] }] }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { invalidInput, manualSessionErrorResponse, uuidSchema } from '../_shared';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const tutorId = uuidSchema.safeParse(new URL(request.url).searchParams.get('tutorId'));
  if (!tutorId.success) return invalidInput('INVALID_TUTOR_ID');

  try {
    const { timeZone, days } = await manualSessionService.getTutorAvailability(tutorId.data);
    return NextResponse.json({ success: true, timeZone, days });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions/availability');
  }
}
