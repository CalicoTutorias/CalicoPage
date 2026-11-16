/**
 * GET /api/admin/tutors/:userId — Tutor detail (admin user JWT)
 *
 * Approve / reject / suspend / reinstate live in the POST sub-routes, which
 * use requireAdminUser + audit log. The old PUT (x-admin-secret, no audit,
 * no course assignment) was removed.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
  }

  try {
    const detail = await adminService.getTutorDetail(userId);
    if (!detail) {
      return NextResponse.json({ success: false, error: 'TUTOR_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...detail });
  } catch (err) {
    console.error('[GET /api/admin/tutors/[userId]]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
