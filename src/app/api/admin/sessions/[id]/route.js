/**
 * GET /api/admin/sessions/:id
 * Detail of one session for /home/admin/tutorias: people with contact, the
 * student's request and uploaded files (15-minute download links), payments
 * and whether its tutor can be reassigned (`reassign: { allowed, blocker }`).
 * The tutor's study material comes from /api/sessions/:id/materials.
 *
 * Auth: admin user. Not cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as detailService from '@/lib/services/admin-session-detail.service';
import { detailErrorResponse, invalidInput, uuidSchema } from './_shared';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return invalidInput('INVALID_SESSION_ID');

  try {
    const session = await detailService.getSessionDetail(id);
    return NextResponse.json({ success: true, session }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return detailErrorResponse(err, 'GET /api/admin/sessions/[id]');
  }
}
