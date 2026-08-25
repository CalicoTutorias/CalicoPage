export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseManagement from '@/lib/services/course-management.service';

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(160),
  complexity: z.enum(['Introductory', 'Foundational', 'Challenging']),
  basePrice: z.coerce.number().min(0),
  careerId: z.string().uuid(),
  aliases: z.array(z.string()).optional(),
});

const updatePriceSchema = z.object({
  courseId: z.string().uuid(),
  basePrice: z.coerce.number().finite().positive().max(1_000_000),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 422 },
    );
  }

  try {
    const course = await courseManagement.createCourseAsAdmin({
      adminId: auth.sub,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'COURSE_EXISTS' }, { status: 409 });
    }
    if (err.code === 'P2003') {
      return NextResponse.json({ success: false, error: 'INVALID_CAREER' }, { status: 422 });
    }
    console.error('[POST /api/admin/courses]', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = updatePriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 422 },
    );
  }

  try {
    const course = await courseManagement.updateCoursePriceAsAdmin({
      adminId: auth.sub,
      courseId: parsed.data.courseId,
      basePrice: parsed.data.basePrice,
      request,
    });
    return NextResponse.json({ success: true, course });
  } catch (err) {
    if (err.code === 'P2025' || err.code === 'COURSE_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'COURSE_NOT_FOUND' }, { status: 404 });
    }
    console.error('[PATCH /api/admin/courses] Failed to update course price');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
