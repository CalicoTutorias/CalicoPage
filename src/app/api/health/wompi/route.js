/**
 * GET /api/health/wompi
 * Verifies Wompi env vars are configured and the API is reachable
 * by calling the public merchant endpoint.
 *
 * Returns 200 { ok, merchantId } on success, 503 with { ok: false, error } on failure.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as WompiService from '@/lib/services/wompi.service';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await WompiService.healthCheck();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const reason = err?.message || 'Wompi connectivity error';
    console.error('[GET /api/health/wompi]:', reason);
    return NextResponse.json({ ok: false, error: reason }, { status: 503 });
  }
}
