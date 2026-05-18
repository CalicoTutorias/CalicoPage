/**
 * GET /api/admin/tutors
 * List of approved tutors. Filters:
 *   ?status=active|suspended  (default: active)
 *   ?search=<text>            (matches name OR email, case-insensitive)
 *   ?limit=<n>&offset=<n>
 *
 * Auth: admin user (JWT + role lookup in DB).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const ALLOWED_STATUS = new Set(['active', 'suspended', 'all']);

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get('status') ?? 'active';
  const status    = ALLOWED_STATUS.has(rawStatus) ? rawStatus : 'active';
  const search    = searchParams.get('search')?.trim() || undefined;
  const limit     = Math.max(1, Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200));
  const offset    = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  try {
    const { items, total } = await adminService.listApprovedTutors({
      status: status === 'all' ? undefined : status,
      search,
      limit,
      offset,
    });
    return NextResponse.json({ success: true, tutors: items, total });
  } catch (err) {
    console.error('[GET /api/admin/tutors]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
