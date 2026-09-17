/**
 * POST /api/calendar/exchange-token
 * Exchange a Google authorization code for tokens (programmatic API clients only).
 * Requires Calico authentication.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { success: false, error: 'Esta operación no está disponible públicamente.' },
    { status: 404 },
  );
}
