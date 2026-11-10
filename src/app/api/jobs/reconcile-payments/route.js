/**
 * POST /api/jobs/reconcile-payments — scheduled payment sweeper.
 *
 * Called every 10 minutes by an external scheduler (Google Apps Script) with
 * the `x-admin-secret` header; no body. Asks Wompi about the recent
 * unconsumed payment intents and books the approved ones no confirmation path
 * booked (payment-sweeper.service). Service-to-service only: there is no
 * human identity, so `requireAdminSecret` is the guard.
 *
 * 200 { success: true, checked, deferred, counts, items }
 * Runbook: docs/ops/payments-sweeper.md
 */

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireAdminSecret } from '@/lib/auth/guards';
import { sweepUnconsumedIntents } from '@/lib/services/payment-sweeper.service';

export const dynamic = 'force-dynamic';
// Vercel Hobby allows 60 s without Fluid compute (300 s with it); the service
// stops starting new intents after 30 s to answer well inside this.
export const maxDuration = 60;

export async function POST(request) {
  const guard = requireAdminSecret(request);
  if (guard instanceof NextResponse) return guard;

  try {
    const summary = await sweepUnconsumedIntents();
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error('[POST /api/jobs/reconcile-payments]', err);
    Sentry.withScope((scope) => {
      scope.setTag('service', 'wompi');
      scope.setTag('issue_type', 'sweeper_failed');
      scope.setLevel('error');
      Sentry.captureException(err);
    });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
