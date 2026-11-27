/**
 * DELETE /api/sessions/:id/reschedule-requests/:requestId — Withdraw a proposal
 *
 * Auth: required, only whoever proposed the change and only while it is
 * unanswered. The session stays where it is; the other side is told.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as rescheduleService from '@/lib/services/session-reschedule.service';
import { rescheduleErrorResponse } from '@/lib/api/reschedule-response';

export async function DELETE(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id, requestId } = await params;
  try {
    await rescheduleService.withdraw({ sessionId: id, requestId, userId: String(auth.sub ?? '').trim() });
    return NextResponse.json({ success: true });
  } catch (err) {
    return rescheduleErrorResponse(err, 'DELETE /api/sessions/:id/reschedule-requests/:requestId');
  }
}
