/**
 * PUT    /api/availabilities/:id — Update an availability block
 * DELETE /api/availabilities/:id — Delete an availability block
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

const updateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  /** Nombre visible del bloque (columna ya existente en DB) */
  label: z.union([z.string().max(160), z.null()]).optional(),
});

function timeStringToDate(timeStr) {
  const m = String(timeStr || '').match(/^(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(`1970-01-01T${m[1]}:${m[2]}:00.000Z`);
}

export async function PUT(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const data = {};
  if (parsed.data.dayOfWeek !== undefined) data.dayOfWeek = parsed.data.dayOfWeek;
  if (parsed.data.startTime !== undefined && parsed.data.startTime !== '') {
    const d = timeStringToDate(parsed.data.startTime);
    if (!d || Number.isNaN(d.getTime())) {
      return NextResponse.json({ success: false, error: 'startTime inválido (usa HH:MM)' }, { status: 400 });
    }
    data.startTime = d;
  }
  if (parsed.data.endTime !== undefined && parsed.data.endTime !== '') {
    const d = timeStringToDate(parsed.data.endTime);
    if (!d || Number.isNaN(d.getTime())) {
      return NextResponse.json({ success: false, error: 'endTime inválido (usa HH:MM)' }, { status: 400 });
    }
    data.endTime = d;
  }
  if (parsed.data.label !== undefined) data.label = parsed.data.label;

  try {
    const block = await availabilityService.updateAvailability(id, auth.sub, data);
    return NextResponse.json({ success: true, availability: block });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403 },
      );
    }
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

export async function DELETE(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    await availabilityService.deleteAvailability(id, auth.sub);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403 },
      );
    }
    throw err;
  }
}
