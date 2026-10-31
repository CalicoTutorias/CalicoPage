/**
 * GET /api/admin/metrics/event-earnings?months=12
 * Per-repaso earnings for the admin dashboard: every published repaso from
 * `months` months ago on (upcoming ones included) with what was collected,
 * what its tutors are owed (and already paid), the Wompi fee and Calico's
 * net, plus held / upcoming totals and the earnings policy behind them
 * (src/lib/payments/event-earnings.js).
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

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get('months') ?? '12', 10) || 12;

  try {
    const data = await metricsService.getEventEarnings({ months });
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('[GET /api/admin/metrics/event-earnings]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
