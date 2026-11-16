/**
 * GET /api/admin/manual-sessions/tutors?courseId=
 * Tutors offering this course today, for the manual-session form.
 *
 * Auth: requireAdminUser.
 * Returns: { success: true, tutors: [{ id, name }] }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { invalidInput, manualSessionErrorResponse, uuidSchema } from '../_shared';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const courseId = uuidSchema.safeParse(new URL(request.url).searchParams.get('courseId'));
  if (!courseId.success) return invalidInput('INVALID_COURSE_ID');

  try {
    const tutors = await manualSessionService.listTutorsForCourse(courseId.data);
    return NextResponse.json({ success: true, tutors });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions/tutors');
  }
}
