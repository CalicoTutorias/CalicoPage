/**
 * GET /api/session-invitations — My pending invitations to group sessions
 *
 * Auth: required. Invitations addressed to the user's own emails (login email
 * and verified university email) for sessions still to come.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const invitations = await invitationService.listMine(String(auth.sub ?? '').trim());
    return NextResponse.json({ success: true, invitations });
  } catch (err) {
    return invitationErrorResponse(err, 'GET /api/session-invitations');
  }
}
