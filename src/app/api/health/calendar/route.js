/**
 * GET /api/health/calendar
 * Verifies the central Calico calendar is reachable with a live admin token.
 *
 * Public on purpose: the hourly Apps Script monitor polls it and cannot hold a
 * JWT. The payload is a bare `ok` — no reason, no env var names, nothing about
 * why it failed — so it leaks no more than /api/health/db already does. The
 * sanitized reason is logged server-side by verifyConnection().
 *
 * Returns 200 { ok: true } when connected, 503 { ok: false } otherwise.
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '@/lib/services/calico-calendar.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await calicoCalendarService.verifyConnection();
    return NextResponse.json({ ok: status.connected }, { status: status.connected ? 200 : 503 });
  } catch (err) {
    // Never log the error object: a GaxiosError carries the refresh token in
    // `config.data`.
    console.error('[GET /api/health/calendar]: check failed', { code: err?.code ?? null });
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
