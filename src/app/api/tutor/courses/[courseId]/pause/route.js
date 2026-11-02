/**
 * POST   /api/tutor/courses/[courseId]/pause — stop offering an approved course
 * DELETE /api/tutor/courses/[courseId]/pause — offer it again
 *
 * Students no longer find or book a paused course; sessions already scheduled
 * stay as they are. Resuming needs no admin, and works on a Paused course only.
 *
 * Auth: requireTutor; the tutor is always auth.sub.
 * Returns: { success, tutorCourse } · 404 not in the catalog · 409 INVALID_STATE
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as academicService from '@/lib/services/academic.service';

const STATUS_BY_CODE = { NOT_FOUND: 404, INVALID_STATE: 409 };

async function change(request, params, action) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { courseId } = await params;
  try {
    const tutorCourse = await action(auth.sub, courseId);
    return NextResponse.json({ success: true, tutorCourse });
  } catch (err) {
    const status = STATUS_BY_CODE[err?.code];
    if (status) return NextResponse.json({ success: false, error: err.message, code: err.code }, { status });
    console.error('[/api/tutor/courses/[courseId]/pause]:', err?.message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  return change(request, params, academicService.pauseTutorCourse);
}

export async function DELETE(request, { params }) {
  return change(request, params, academicService.resumeTutorCourse);
}
