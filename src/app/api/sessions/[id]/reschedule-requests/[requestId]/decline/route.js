/**
 * POST /api/sessions/:id/reschedule-requests/:requestId/decline — Decline a proposal
 *
 * Auth: required, only the person the proposal was made to. The session stays
 * where it is; whoever proposed is told by email and notification.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as rescheduleService from '@/lib/services/session-reschedule.service';
import { rescheduleErrorResponse } from '@/lib/api/reschedule-response';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  const limited = rateLimit(`reschedule-answer:${userId}`, { max: 20, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const { id, requestId } = await params;
  try {
    await rescheduleService.decline({ sessionId: id, requestId, userId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return rescheduleErrorResponse(err, 'POST /api/sessions/:id/reschedule-requests/:requestId/decline');
  }
}
