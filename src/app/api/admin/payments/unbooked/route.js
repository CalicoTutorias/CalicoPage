/**
 * GET /api/admin/payments/unbooked
 * "Pagos sin tutoría": unconsumed payment intents where money was (or may
 * have been) taken but nothing was booked — the payments sweeper saw an
 * APPROVED transaction (`metadata.sweep.status`), or confirm-payment pinned a
 * pending transaction more than 15 minutes ago. Each item carries what the
 * operator needs to retry it through POST /api/admin/payments/reconcile.
 * No query parameters.
 *
 * Auth: admin user. Not cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminSessionsService from '@/lib/services/admin-sessions.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await adminSessionsService.listUnbookedPayments();
    return NextResponse.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/admin/payments/unbooked]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
