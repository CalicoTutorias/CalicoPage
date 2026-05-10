/**
 * GET /api/admin/metrics/active-tutors?days=30&limit=10
 * Top tutors by completed sessions in the given range.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as metricsService from '@/lib/services/admin-metrics.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const days  = parseInt(searchParams.get('days')  ?? '30', 10) || 30;
  const limit = parseInt(searchParams.get('limit') ?? '10', 10) || 10;

  try {
    const items = await metricsService.getTopTutors({ days, limit });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/admin/metrics/active-tutors]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
