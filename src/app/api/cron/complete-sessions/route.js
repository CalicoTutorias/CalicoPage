/**
 * GET /api/cron/complete-sessions — daily Vercel Cron (vercel.json). Completes
 * the Accepted sessions that ended over an hour ago, so students are asked to
 * rate them and tutors to rate their students. See session-auto-complete.service.
 *
 * Auth: requireCronSecret (`Authorization: Bearer <CRON_SECRET>`, sent by Vercel).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/auth/guards';
import * as autoCompleteService from '@/lib/services/session-auto-complete.service';
import { invalidateAllMetrics } from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = requireCronSecret(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await autoCompleteService.autoCompleteEndedSessions();
    if (result.completed > 0) invalidateAllMetrics();
    console.log('[cron/complete-sessions]', JSON.stringify(result));
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[cron/complete-sessions]', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
