/**
 * GET /api/admin/metrics/retention?days=90&careerId=<uuid>
 * Repeat-rate KPIs for students active in the range, optionally filtered
 * by the student's career.
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
  const days     = parseInt(searchParams.get('days') ?? '90', 10) || 90;
  const careerId = searchParams.get('careerId') || null;

  try {
    // Repeat KPIs are career/range filtered; active-user counts are global
    // and use a fixed 7-day "last week" window, so they're fetched together
    // but cached independently.
    const [data, active] = await Promise.all([
      growthService.getRetentionOverview({ days, careerId }),
      growthService.getActiveUsers({ days: 7 }),
    ]);
    return NextResponse.json({ success: true, ...data, ...active });
  } catch (err) {
    console.error('[GET /api/admin/metrics/retention]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
