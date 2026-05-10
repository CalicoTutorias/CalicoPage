/**
 * GET /api/admin/tutors/pending
 * List of tutor applications awaiting review.
 * Auth: admin user (JWT + role lookup in DB).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit  = Math.max(1, Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  try {
    const { items, total } = await adminService.listPendingApplications({ limit, offset });
    return NextResponse.json({ success: true, applications: items, total });
  } catch (err) {
    console.error('[GET /api/admin/tutors/pending]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
