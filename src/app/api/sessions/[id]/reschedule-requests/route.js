/**
 * GET  /api/sessions/:id/reschedule-requests — The open proposal to move the
 *        session (if any) and whether the caller can make one.
 * POST /api/sessions/:id/reschedule-requests — Propose a new start
 *        { startTimestamp: ISO, message?: string }
 *
 * Auth: required.
 *  - GET: anyone in the session. Guests of a group session see that a change
 *    is proposed, never the note that goes with it.
 *  - POST: the tutor or the student who booked, for a Pending/Accepted
 *    session that has not started. The session keeps its duration. The other
 *    side gets an email and a notification, so this is rate-limited.
 *
 * Nothing moves until the other side accepts
 * (POST /api/sessions/:id/reschedule-requests/:requestId/accept).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as rescheduleService from '@/lib/services/session-reschedule.service';
import { rescheduleErrorResponse } from '@/lib/api/reschedule-response';
import { RESCHEDULE_MESSAGE_MAX } from '@/lib/sessions/reschedule';

const proposeSchema = z.object({
  startTimestamp: z.string().datetime(),
  message: z.string().max(RESCHEDULE_MESSAGE_MAX * 2).nullish(),
});

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const result = await rescheduleService.getForSession({ sessionId: id, userId: String(auth.sub ?? '').trim() });
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return rescheduleErrorResponse(err, 'GET /api/sessions/:id/reschedule-requests');
  }
}

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  const limited = rateLimit(`reschedule-propose:${userId}`, { max: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path?.[0];
    return NextResponse.json(
      { success: false, error: field === 'message' ? 'MESSAGE_TOO_LONG' : 'INVALID_TIME' },
      { status: 400 },
    );
  }

  try {
    const result = await rescheduleService.propose({
      sessionId: id,
      userId,
      startTimestamp: new Date(parsed.data.startTimestamp),
      message: parsed.data.message ?? null,
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    return rescheduleErrorResponse(err, 'POST /api/sessions/:id/reschedule-requests');
  }
}
