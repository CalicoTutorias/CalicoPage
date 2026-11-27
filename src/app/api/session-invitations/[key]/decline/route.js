/**
 * POST /api/session-invitations/:key/decline — Say no to an invitation
 *
 * Auth: optional with the email token (no account is needed to decline),
 * required with an invitation id. The seat is free again for the organiser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tryAuthenticateRequest } from '@/lib/auth/middleware';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function POST(request, { params }) {
  const limited = rateLimit(`invitation-decline:${getClientIp(request)}`, { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { key } = await params;
  const auth = await tryAuthenticateRequest(request);

  try {
    await invitationService.decline({ key, userId: auth?.sub ?? null });
    return NextResponse.json({ success: true });
  } catch (err) {
    return invitationErrorResponse(err, 'POST /api/session-invitations/:key/decline');
  }
}
