/**
 * GET /api/admin/payouts?view=byTutor|flat
 * Default `byTutor` → returns the weekly digest:
 *   { groups: [{ tutor, llave, totalGross, tutorOwed, paymentsCount, paymentIds }],
 *     totals: { gross, tutorOwed, calicoNet, wompiFee, tutorsCount, paymentsCount } }
 *
 * `flat` → list of individual pending payments with per-row owed/net.
 *
 * Auth: admin user.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') === 'flat' ? 'flat' : 'byTutor';

  try {
    if (view === 'flat') {
      const items = await payoutsService.listPendingPayments({ limit: 200 });
      return NextResponse.json({ success: true, view, items });
    }
    const data = await payoutsService.listPendingPayoutsByTutor();
    return NextResponse.json({ success: true, view, ...data });
  } catch (err) {
    console.error('[GET /api/admin/payouts]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
