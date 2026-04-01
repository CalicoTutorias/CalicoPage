/**
 * POST /api/availabilities/bulk-replace — Replace all blocks for a given day
 *
 * Body: { dayOfWeek: 0-6, blocks: [{ startTime: "HH:MM", endTime: "HH:MM" }, ...] }
 *
 * Deletes all existing blocks for that day and creates the new ones
 * atomically in a single transaction.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const blockSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM'),
});

const bulkReplaceSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  blocks: z.array(blockSchema).max(20, 'Maximum 20 blocks per day'),
});

function timeStringToDate(timeStr) {
  return new Date(`1970-01-01T${timeStr}:00.000Z`);
}

export async function POST(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = bulkReplaceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { dayOfWeek, blocks } = parsed.data;

  const convertedBlocks = blocks.map((b) => ({
    startTime: timeStringToDate(b.startTime),
    endTime: timeStringToDate(b.endTime),
  }));

  try {
    const created = await availabilityService.replaceAvailabilityForDay(
      auth.sub,
      dayOfWeek,
      convertedBlocks,
    );

    return NextResponse.json({
      success: true,
      availabilities: created,
      count: created.length,
    });
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
