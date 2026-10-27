/**
 * GET /api/health/wompi
 * Verifies Wompi env vars are configured and the API is reachable
 * by calling the public merchant endpoint, and that WOMPI_PRIVATE_KEY is
 * accepted by the environment it points to (`privateKey`). A rejected key
 * does not flip `ok` (checkouts still verify through the unauthenticated
 * fallback) but is the first thing to check when confirmations fail.
 *
 * Returns 200 { ok, merchantId, privateKey: { ok, environment, status, reason } }
 * on success, 503 with { ok: false, error } when Wompi is unreachable.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as WompiService from '@/lib/services/wompi.service';
import * as wompiApi from '@/lib/services/wompi-api.service';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await WompiService.healthCheck();
    const privateKey = await wompiApi.verifyPrivateKey();
    if (!privateKey.ok) console.error('[GET /api/health/wompi] WOMPI_PRIVATE_KEY rejected:', privateKey);
    return NextResponse.json({ ok: true, ...result, privateKey }, { status: 200 });
  } catch (err) {
    const reason = err?.message || 'Wompi connectivity error';
    console.error('[GET /api/health/wompi]:', reason);
    return NextResponse.json({ ok: false, error: reason }, { status: 503 });
  }
}
