/**
 * GET /api/admin/users/:userId
 * Full admin profile for one user: safe identity fields, subjects they
 * tutor, activity stats (as student and tutor), a 12-month activity series
 * and recent sessions on each side.
 *
 * Auth: admin user (JWT + role lookup in DB). Returns confidential info.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as usersService from '@/lib/services/admin-users.service';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
  }

  try {
    const profile = await usersService.getUserProfile(userId);
    if (!profile) {
      return NextResponse.json({ success: false, error: 'USER_NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...profile });
  } catch (err) {
    console.error('[GET /api/admin/users/[userId]]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
