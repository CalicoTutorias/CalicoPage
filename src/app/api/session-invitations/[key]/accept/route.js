/**
 * POST /api/session-invitations/:key/accept — Take the seat of an invitation
 *
 * Auth: required. The user joins the session as `auth.sub` (never an id from
 * the request), is added to its calendar event and gets the confirmation
 * email with the Meet link. Idempotent for the same user.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as invitationService from '@/lib/services/session-invitation.service';
import { scopeSessionForStudent } from '@/lib/services/session.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { key } = await params;
  const userId = String(auth.sub ?? '').trim();

  try {
    const { session, alreadyJoined } = await invitationService.accept({ key, userId });
    return NextResponse.json({
      success: true,
      alreadyJoined,
      session: scopeSessionForStudent(session, userId),
    });
  } catch (err) {
    return invitationErrorResponse(err, 'POST /api/session-invitations/:key/accept');
  }
}
