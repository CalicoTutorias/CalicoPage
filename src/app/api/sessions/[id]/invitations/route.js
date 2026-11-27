/**
 * GET  /api/sessions/:id/invitations — Seats and invitations of a group session
 * POST /api/sessions/:id/invitations — Invite one more guest  { email }
 *
 * Auth: required.
 *  - GET: anyone in the session. Only the student who booked it gets the
 *    invited addresses; the tutor and the guests get the seat counts.
 *  - POST: only the student who booked it, while the session has not started
 *    and a paid seat is free. Rate-limited: this endpoint sends email.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as invitationService from '@/lib/services/session-invitation.service';
import { invitationErrorResponse } from '@/lib/api/invitation-response';

const inviteSchema = z.object({ email: z.string().trim().min(3).max(254) });

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const result = await invitationService.listForSession({ sessionId: id, userId: String(auth.sub ?? '').trim() });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return invitationErrorResponse(err, 'GET /api/sessions/:id/invitations');
  }
}

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  const limited = rateLimit(`invitation-send:${userId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'INVITE_INVALID_EMAIL' }, { status: 400 });
  }

  try {
    const { invitation, emailSent } = await invitationService.inviteGuest({
      sessionId: id,
      userId,
      email: parsed.data.email,
    });
    return NextResponse.json(
      { success: true, invitation: { id: invitation.id, email: invitation.email, status: invitation.status }, emailSent },
      { status: 201 },
    );
  } catch (err) {
    return invitationErrorResponse(err, 'POST /api/sessions/:id/invitations');
  }
}
