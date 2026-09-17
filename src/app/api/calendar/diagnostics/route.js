/**
 * Calendar Diagnostics API Route
 * GET /api/calendar/diagnostics - Check OAuth configuration
 */

import { NextResponse } from 'next/server';

/**
 * GET /api/calendar/diagnostics
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Esta operación no está disponible públicamente.' },
    { status: 404 },
  );
}
