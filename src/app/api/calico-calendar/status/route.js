/**
 * Calico Calendar Status API Route
 * GET /api/calico-calendar/status - Check if service is configured
 */

import { NextResponse } from 'next/server';

/**
 * GET /api/calico-calendar/status
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Esta operación no está disponible públicamente.' },
    { status: 404 },
  );
}
