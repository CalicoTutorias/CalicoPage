/**
 * POST /api/admin/tutors/[userId]/reject
 * Body: { reason: string }
 *
 * Reject a pending tutor application with an audit-trail reason.
 * Does NOT touch users.is_tutor_approved (stays false).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminService from '@/lib/services/admin.service';

const bodySchema = z.object({
  reason: z.string().min(5, 'La razón del rechazo debe tener al menos 5 caracteres.').max(2000),
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
    const application = await adminService.rejectTutor({
      userId,
      adminId: auth.sub,
      reason: parsed.data.reason,
      request,
    });
    return NextResponse.json({ success: true, application });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'INVALID_INPUT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/tutors/[userId]/reject]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
