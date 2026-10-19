/**
 * GET /api/admin/metrics/session-history?status=all&limit=25&offset=0
 * Paginated session history for the admin dashboard: when each session was
 * booked and held, who took it and who gave it, its length, status and the
 * money behind it. status ∈ all | scheduled | completed | canceled.
 *
 * Auth: admin user. Not cached (see getSessionHistory).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as metricsService from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const limit  = parseInt(searchParams.get('limit')  ?? '25', 10) || 25;
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)  || 0;

  try {
    const page = await metricsService.getSessionHistory({ status, limit, offset });
    return NextResponse.json({ success: true, ...page });
  } catch (err) {
    console.error('[GET /api/admin/metrics/session-history]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
