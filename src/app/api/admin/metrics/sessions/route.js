/**
 * GET /api/admin/metrics/sessions?weeks=12
 * Weekly time series of sessions (Completed / Canceled / upcoming) for
 * the chart on the admin dashboard. Default 12 weeks, max 52.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as metricsService from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const weeks = parseInt(searchParams.get('weeks') ?? '12', 10) || 12;

  try {
    const series = await metricsService.getSessionsSeries({ weeks });
    return NextResponse.json({ success: true, series });
  } catch (err) {
    console.error('[GET /api/admin/metrics/sessions]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
