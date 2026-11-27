/**
 * POST /api/sessions/:id/invitations/:invitationId/resend — Send the invitation again
 *
 * Auth: required, only the student who booked the session. The email carries
 * a NEW link (the previous one stops working). Capped per invitation
 * (INVITATION_MAX_SENDS, with a cooldown) and rate-limited per user.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  const limited = rateLimit(`invitation-send:${userId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const { id, invitationId } = await params;
  try {
    await invitationService.resend({ sessionId: id, invitationId, userId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return invitationErrorResponse(err, 'POST /api/sessions/:id/invitations/:invitationId/resend');
  }
}
