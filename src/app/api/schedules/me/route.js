/**
 * GET  /api/schedules/me — Get my schedule configuration
 * PUT  /api/schedules/me — Create or update my schedule configuration
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';
import {
  BOOKING_NOTICE_OPTIONS,
  MIN_CONSECUTIVE_HOURS,
  MAX_CONSECUTIVE_HOURS_LIMIT,
} from '@/lib/payments/batch-discount';

const updateScheduleSchema = z.object({
  timezone: z.string().optional(),
  autoAcceptSession: z.boolean().optional(),
  // Anticipación mínima (h): solo las opciones que ofrece la UI.
  minBookingNotice: z.number().int().refine((v) => BOOKING_NOTICE_OPTIONS.includes(v), {
    message: `minBookingNotice must be one of ${BOOKING_NOTICE_OPTIONS.join(', ')}`,
  }).optional(),
  maxConsecutiveHours: z.number().int().min(MIN_CONSECUTIVE_HOURS).max(MAX_CONSECUTIVE_HOURS_LIMIT).optional(),
  maxSessionsPerDay: z.number().int().min(1).optional(),
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

  const schedule = await availabilityService.upsertSchedule(auth.sub, parsed.data);

  return NextResponse.json({ success: true, schedule });
}
