/**
 * PUT /api/admin/tutor-courses/:tutorId/:courseId — Approve or reject a tutor course request
 * Auth: requires an authenticated user with role=ADMIN (checked against the DB).
 * Body: { "status": "Approved" | "Rejected" }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import { approveTutorCourse, rejectTutorCourse } from '@/lib/services/academic.service';

const schema = z.object({
  status: z.enum(['Approved', 'Rejected']),
});

export async function PUT(request, { params }) {
  const guard = await requireAdminUser(request);
  if (guard instanceof NextResponse) return guard;

  const { tutorId, courseId } = await params;

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
    const tutorCourse =
      parsed.data.status === 'Approved'
        ? await approveTutorCourse(tutorId, courseId)
        : await rejectTutorCourse(tutorId, courseId);

    return NextResponse.json({ success: true, tutorCourse });
  } catch (error) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Tutor course not found' },
        { status: 404 },
      );
    }
    throw error;
  }
}
