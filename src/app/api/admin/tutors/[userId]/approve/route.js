/**
 * POST /api/admin/tutors/[userId]/approve
 * Body: { courseIds: string[] }
 *
 * Approve a tutor application granting only the specified subset of
 * courses. The remaining subjects on the application are recorded as
 * Rejected so the per-course status is explicit on tutor_courses.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const bodySchema = z.object({
  courseIds: z.array(z.string().uuid()).min(1, 'Selecciona al menos una materia para aprobar.'),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
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
    const result = await adminService.approveTutor({
      userId,
      adminId: auth.sub,
      approvedCourseIds: parsed.data.courseIds,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'ALREADY_APPROVED' || err.code === 'EMPTY_APPROVAL') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/tutors/[userId]/approve]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
