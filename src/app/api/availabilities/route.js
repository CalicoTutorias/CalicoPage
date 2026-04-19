/**
 * GET  /api/availabilities?userId={id} — Public: list availability blocks for a tutor
 * POST /api/availabilities              — Tutor: create a single availability block
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const createSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();

  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'userId query param is required' },
      { status: 400 },
    );
  }

  // Get availability blocks and booked sessions (User.id / Availability.userId are strings in Prisma)
  const { availabilities, bookedSessions } = await availabilityService.getFreeAvailabilityByUserId(userId);
  
  return NextResponse.json({ 
    success: true, 
    availabilities,
    bookedSessions, // Include booked sessions so frontend can filter
  });
}

/**
 * Convert "HH:MM" string to a Date with only time component (1970-01-01).
 * This matches Prisma's @db.Time() storage.
 */
function timeStringToDate(timeStr) {
  return new Date(`1970-01-01T${timeStr}:00.000Z`);
}

export async function POST(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const block = await availabilityService.createAvailability({
      userId: auth.sub,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: timeStringToDate(parsed.data.startTime),
      endTime: timeStringToDate(parsed.data.endTime),
    });

    return NextResponse.json({ success: true, availability: block }, { status: 201 });
  } catch (err) {
    if (err.code === 'OVERLAP') {
      return NextResponse.json(
        { success: false, error: err.message, code: 'OVERLAP' },
        { status: 409 },
      );
    }
    if (err.code === 'INVALID_TIMES') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}
