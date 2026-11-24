/**
 * GET  /api/schedules/me — Get my schedule configuration
 * PUT  /api/schedules/me — Create or update my schedule configuration
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';
import { MAX_HOURS_PER_DAY_LIMIT, SESSION_DURATIONS } from '@/lib/sessions/session-duration';

const updateScheduleSchema = z.object({
  timezone: z.string().optional(),
  autoAcceptSession: z.boolean().optional(),
  minBookingNotice: z.number().int().min(0).optional(),
  // Hours of tutoring per day (not sessions).
  maxHoursPerDay: z.number().int().min(1).max(MAX_HOURS_PER_DAY_LIMIT).optional(),
  // Longest session the tutor accepts: 60, 90 or 120 minutes.
  maxSessionMinutes: z.number().int().refine((m) => SESSION_DURATIONS.includes(m), 'Duración no permitida').optional(),
  bufferTime: z.number().int().min(0).optional(),
  calendarSyncId: z.string().nullable().optional(),
  calendarSyncMode: z.enum(['available', 'busy']).optional(),
});

export async function GET(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const schedule = await availabilityService.getSchedule(auth.sub);

  return NextResponse.json({
    success: true,
    schedule: schedule || null,
  });
}

export async function PUT(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = updateScheduleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const data = { ...parsed.data };
  // Sync reads calendarSyncIds first: keep the list in step with the legacy field.
  if (data.calendarSyncId !== undefined) data.calendarSyncIds = data.calendarSyncId ? [data.calendarSyncId] : [];

  const schedule = await availabilityService.upsertSchedule(auth.sub, data);

  return NextResponse.json({ success: true, schedule });
}
