/**
 * GET /api/admin/metrics/profitability?days=90&departmentId=<uuid>
 * Per-course profitability (exact Calico net, margin, net/session) for the
 * range, optionally filtered by the course's department.
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
  const days         = parseInt(searchParams.get('days') ?? '90', 10) || 90;
  const departmentId = searchParams.get('departmentId') || null;

  try {
    const items = await growthService.getCourseProfitability({ days, departmentId });
    return NextResponse.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/admin/metrics/profitability]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
