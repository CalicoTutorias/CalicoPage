/**
 * POST /api/admin/tutors/[userId]/reinstate
 * No body required.
 *
 * Lift an active suspension. Restores is_active=true and clears
 * suspended_* fields.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
  }

  try {
    const user = await adminService.reinstateTutor({
      userId,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, user });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'INVALID_STATE') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/tutors/[userId]/reinstate]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
