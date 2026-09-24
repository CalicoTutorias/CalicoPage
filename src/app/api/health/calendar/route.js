/**
 * GET /api/health/calendar
 * Verifies the central Calico calendar is reachable with a live admin token.
 *
 * Public on purpose: the hourly Apps Script monitor polls it and cannot hold a
 * JWT. The payload carries `ok` plus a fixed `reason` label from
 * getSafeCalendarErrorCode — never an env var name, a message or an error
 * object — so it leaks no more than /api/health/db already does while still
 * saying whether the token died, a scope is missing or the API is off. Without
 * it, every diagnosis needs Vercel's one-hour log window.
 *
 * Returns 200 { ok: true } when connected, 503 { ok: false, reason } otherwise.
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '@/lib/services/calico-calendar.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await calicoCalendarService.verifyConnection();
    if (status.connected) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    return NextResponse.json({ ok: false, reason: status.reason }, { status: 503 });
  } catch (err) {
    // Never log the error object: a GaxiosError carries the refresh token in
    // `config.data`.
    console.error('[GET /api/health/calendar]: check failed', { code: err?.code ?? null });
    return NextResponse.json({ ok: false, reason: 'check_failed' }, { status: 503 });
  }
}
