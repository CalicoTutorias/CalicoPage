/**
 * PUT /api/admin/course-prices/:courseId — Update the price for a specific course
 * Header required: x-admin-secret
 * Body: { "price": number }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { upsertCoursePrice } from '@/lib/services/academic.service';

const schema = z.object({
  price: z.number().positive('Price must be positive'),
});

export async function PUT(request, { params }) {
  const guard = requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { courseId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const coursePrice = await upsertCoursePrice(courseId, parsed.data.price);
    return NextResponse.json({ success: true, coursePrice });
  } catch (error) {
    if (error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Course not found' }, { status: 404 });
    }
    throw error;
  }
}
