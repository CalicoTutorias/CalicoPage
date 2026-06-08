/**
 * GET /api/admin/users
 * Searchable directory of ALL users (students, tutors, admins). Filters:
 *   ?role=all|students|tutors|admins|suspended   (default: all)
 *   ?search=<text>                               (matches name OR email)
 *   ?limit=<n>&offset=<n>
 *
 * Auth: admin user (JWT + role lookup in DB). Returns confidential contact
 * info, so it MUST stay behind requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as usersService from '@/lib/services/admin-users.service';

const ALLOWED_ROLES = new Set(['all', 'students', 'tutors', 'admins', 'suspended']);

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const rawRole = searchParams.get('role') ?? 'all';
  const role    = ALLOWED_ROLES.has(rawRole) ? rawRole : 'all';
  const search  = searchParams.get('search')?.trim() || undefined;
  const limit   = Math.max(1, Math.min(parseInt(searchParams.get('limit')  ?? '50', 10) || 50, 200));
  const offset  = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  try {
    const { items, total } = await usersService.listUsers({ role, search, limit, offset });
    return NextResponse.json({ success: true, users: items, total });
  } catch (err) {
    console.error('[GET /api/admin/users]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
