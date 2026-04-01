/**
 * GET /api/sessions/stats — Student dashboard stats (authenticated)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';

export async function GET(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const stats = await sessionService.getStudentStats(auth.sub);
  return NextResponse.json({ success: true, stats });
}
