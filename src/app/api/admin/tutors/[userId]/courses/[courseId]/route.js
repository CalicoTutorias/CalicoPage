/**
 * PUT /api/admin/tutors/[userId]/courses/[courseId]
 * Body: { status: 'Approved' | 'Pending' | 'Rejected' }
 *
 * Inline status change of a single tutor_course row. Used to approve/reject
 * a course the tutor requested after their initial approval.
 *
 * Auth: admin user (JWT + role lookup). Differs from the legacy endpoint
 * /api/admin/tutor-courses/[tutorId]/[courseId] which uses x-admin-secret;
 * the legacy stays for cron/scripts.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const bodySchema = z.object({
  status: z.enum(['Approved', 'Pending', 'Rejected']),
});

export async function PUT(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, courseId } = await params;
  if (!userId || !courseId) {
    return NextResponse.json({ success: false, error: 'INVALID_PARAMS' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 422 },
    );
  }

  try {
    const updated = await adminService.setTutorCourseStatus({
      userId,
      courseId,
      adminId: auth.sub,
      status: parsed.data.status,
      request,
    });
    return NextResponse.json({ success: true, tutorCourse: updated });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'INVALID_INPUT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[PUT /api/admin/tutors/[userId]/courses/[courseId]]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
