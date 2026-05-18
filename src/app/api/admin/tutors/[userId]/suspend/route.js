/**
 * POST /api/admin/tutors/[userId]/suspend
 * Body: { reason: string }
 *
 * Suspend an approved tutor: sets is_active=false + suspended_* fields.
 * Future-session cancellation is intentionally NOT done here — handled
 * by a follow-up (see Phase 2 risks).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const bodySchema = z.object({
  reason: z.string().min(5, 'La razón de la suspensión debe tener al menos 5 caracteres.').max(2000),
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
    const user = await adminService.suspendTutor({
      userId,
      adminId: auth.sub,
      reason: parsed.data.reason,
      request,
    });
    return NextResponse.json({ success: true, user });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (
      err.code === 'INVALID_INPUT' ||
      err.code === 'INVALID_STATE' ||
      err.code === 'ALREADY_SUSPENDED'
    ) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/tutors/[userId]/suspend]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
