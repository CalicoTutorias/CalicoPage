/**
 * PUT /api/admin/tutors/:userId — Approve or reject a tutor application
 * Header required: x-admin-secret
 * Body: { "action": "approve" | "reject" }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { approveTutor, rejectTutor } from '@/lib/services/user.service';

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
