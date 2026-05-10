/**
 * GET  /api/admin/course-prices — List all course prices
 * POST /api/admin/course-prices — Set or update the price for a course
 * Header required: x-admin-secret
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { getAllCoursePrices, upsertCoursePrice } from '@/lib/services/academic.service';

const upsertSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  price: z.number().positive('Price must be positive'),
});

export async function GET(request) {
  const guard = requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const prices = await getAllCoursePrices();
  return NextResponse.json({ success: true, prices });
}

export async function POST(request) {
  const guard = requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const coursePrice = await upsertCoursePrice(parsed.data.courseId, parsed.data.price);
  return NextResponse.json({ success: true, coursePrice });
}
