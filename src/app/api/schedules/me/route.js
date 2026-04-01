/**
 * GET  /api/schedules/me — Get my schedule configuration
 * PUT  /api/schedules/me — Create or update my schedule configuration
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const updateScheduleSchema = z.object({
  timezone: z.string().optional(),
  autoAcceptSession: z.boolean().optional(),
  minBookingNotice: z.number().int().min(0).optional(),
  maxSessionsPerDay: z.number().int().min(1).optional(),
  bufferTime: z.number().int().min(0).optional(),
});

export async function GET(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const schedule = await availabilityService.getSchedule(auth.sub);

  return NextResponse.json({
    success: true,
    schedule: schedule || null,
  });
}

export async function PUT(request) {
  const auth = requireTutor(request);
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
