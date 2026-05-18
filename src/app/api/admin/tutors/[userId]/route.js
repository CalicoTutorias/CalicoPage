/**
 * GET /api/admin/tutors/:userId — Tutor detail (admin user JWT)
 * PUT /api/admin/tutors/:userId — Legacy approve/reject (x-admin-secret).
 *   For new code, prefer POST /approve|reject|suspend|reinstate sub-routes
 *   that use requireAdminUser + audit log.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAdminUser } from '@/lib/auth/guards';
import { approveTutor, rejectTutor } from '@/lib/services/user.service';
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

const schema = z.object({
  action: z.enum(['approve', 'reject']),
});

export async function PUT(request, { params }) {
  const guard = requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { userId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const user =
      parsed.data.action === 'approve'
        ? await approveTutor(userId)
        : await rejectTutor(userId);

    return NextResponse.json({ success: true, user });
  } catch (error) {
    if (error.code === 'INVALID_STATE') {
      return NextResponse.json(
        { success: false, error: 'User is not in a valid state for this action' },
        { status: 400 },
      );
    }
    if (error.code === 'P2025' || error.message?.includes('not found')) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }
    throw error;
  }
}
