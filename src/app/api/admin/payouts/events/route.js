/**
 * GET /api/admin/payouts/events
 *
 * Repasos whose tutors still have money to receive (held, met the minimum,
 * paid under the current rule), with each tutor's llave and what is left.
 * Payments are recorded with POST /api/admin/events/[id]/tutor-payouts.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const data = await payoutsService.listEventPayouts();
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('[GET /api/admin/payouts/events]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
