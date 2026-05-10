/**
 * GET /api/admin/metrics/overview
 * Single-call snapshot of the four KPI cards: sessions this week, revenue
 * this month, active tutors (30d), pending applications.
 *
 * Auth: admin user. Result is memoised in-process for 5 min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as metricsService from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const overview = await metricsService.getOverview();
    return NextResponse.json({ success: true, ...overview });
  } catch (err) {
    console.error('[GET /api/admin/metrics/overview]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
