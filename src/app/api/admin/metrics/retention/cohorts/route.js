/**
 * GET /api/admin/metrics/retention/cohorts?months=12&careerId=<uuid>
 * First-session cohorts with within-30/60/90-day return rates, optionally
 * filtered by the student's career.
 *
 * Auth: admin user. Result is memoised in-process for 5 min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as growthService from '@/lib/services/admin-growth.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const months   = parseInt(searchParams.get('months') ?? '12', 10) || 12;
  const careerId = searchParams.get('careerId') || null;

  try {
    const cohorts = await growthService.getRetentionCohorts({ months, careerId });
    return NextResponse.json({ success: true, cohorts });
  } catch (err) {
    console.error('[GET /api/admin/metrics/retention/cohorts]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
