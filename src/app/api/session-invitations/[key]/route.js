/**
 * GET /api/session-invitations/:key — What an invitation to a group session shows
 *
 * `key` is the secret token of the invitation email, or the invitation id for
 * the account it was addressed to (the in-app notification links there).
 *
 * Auth: optional with a token — the guest may not have an account yet — and
 * required with an id. The answer is the minimum to decide (who invites,
 * course, tutor, time, seats): no emails, no price, no Meet link.
 * Rate-limited per IP so tokens cannot be guessed in bulk.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { tryAuthenticateRequest } from '@/lib/auth/middleware';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

export async function GET(request, { params }) {
  const limited = rateLimit(`invitation-preview:${getClientIp(request)}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { key } = await params;
  const auth = await tryAuthenticateRequest(request);

  try {
    const invitation = await invitationService.preview({ key, userId: auth?.sub ?? null });
    return NextResponse.json({ success: true, invitation, isLoggedIn: Boolean(auth?.sub) });
  } catch (err) {
    return invitationErrorResponse(err, 'GET /api/session-invitations/:key');
  }
}
