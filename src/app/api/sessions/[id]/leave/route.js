/**
 * POST /api/sessions/:id/leave — A guest leaves a group session
 *
 * Auth: required. Only a guest (not the student who booked, who cancels the
 * session instead) and only before it starts. The seat is free again and the
 * session goes on for everyone else; nothing is refunded — guests pay nothing.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    await invitationService.leaveSession({ sessionId: id, userId: String(auth.sub ?? '').trim() });
    return NextResponse.json({ success: true });
  } catch (err) {
    return invitationErrorResponse(err, 'POST /api/sessions/:id/leave');
  }
}
