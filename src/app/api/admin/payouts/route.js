/**
 * GET /api/admin/payouts?view=byTutor|flat
 * Default `byTutor` → returns the weekly digest of what is owed:
 *   { groups: [{ tutor, llave, totalGross, tutorOwed, paymentsCount, typeCounts, paymentIds }],
 *     totals: { gross, tutorOwed, calicoNet, wompiFee, tutorsCount, paymentsCount } }
 *
 * `flat` → one page of payments with per-row owed/net, how the student paid
 * (`paymentType`) and whether the tutor was paid (`tutorPayoutStatus`):
 *   ?payout=pending|paid|all  (default pending)
 *   ?type=all|wompi|manual    (default all)
 *   ?limit=&offset=
 *
 * Auth: admin user.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as payoutsService from '@/lib/services/payouts.service';

const flatQuerySchema = z.object({
  payout: z.enum(['pending', 'paid', 'all']).catch('pending'),
  type: z.enum(['all', 'wompi', 'manual']).catch('all'),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
  offset: z.coerce.number().int().min(0).catch(0),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') === 'flat' ? 'flat' : 'byTutor';

  try {
    if (view === 'flat') {
      const { items, total } = await payoutsService.listPayoutPayments(flatQuerySchema.parse({
        payout: searchParams.get('payout') ?? undefined,
        type: searchParams.get('type') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
        offset: searchParams.get('offset') ?? undefined,
      }));
      return NextResponse.json({ success: true, view, items, total });
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
