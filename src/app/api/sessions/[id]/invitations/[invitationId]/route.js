/**
 * DELETE /api/sessions/:id/invitations/:invitationId — Withdraw a pending invitation
 *
 * Auth: required, only the student who booked the session. The link of the
 * invitation stops working and its seat can be offered to someone else.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function DELETE(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id, invitationId } = await params;
  try {
    await invitationService.revoke({ sessionId: id, invitationId, userId: String(auth.sub ?? '').trim() });
    return NextResponse.json({ success: true });
  } catch (err) {
    return invitationErrorResponse(err, 'DELETE /api/sessions/:id/invitations/:invitationId');
  }
}
