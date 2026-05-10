/**
 * GET /api/admin/metrics/revenue?months=12
 * Monthly time series of gross revenue (sum of paid payments).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as metricsService from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') ?? '12', 10) || 12;

  try {
    const series = await metricsService.getRevenueSeries({ months });
    return NextResponse.json({ success: true, series });
  } catch (err) {
    console.error('[GET /api/admin/metrics/revenue]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
