/**
 * GET /api/reschedule-requests — Proposals to move a session that are waiting
 * for the caller's answer (as tutor or as the student who booked), for
 * sessions still to come.
 *
 * Auth: required. The list is the caller's own (auth.sub).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as rescheduleService from '@/lib/services/session-reschedule.service';
import { rescheduleErrorResponse } from '@/lib/api/reschedule-response';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const requests = await rescheduleService.listMine(String(auth.sub ?? '').trim());
    return NextResponse.json({ success: true, requests }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return rescheduleErrorResponse(err, 'GET /api/reschedule-requests');
  }
}
