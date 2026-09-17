/**
 * Calendar Auth API Route
 * GET /api/calendar/auth - Redirect to Google OAuth
 */

import { NextResponse } from 'next/server';

/**
 * GET /api/calendar/auth
 * Redirects to Google Calendar authorization page
 */
export async function GET() {
  return NextResponse.json(
    { success: false, error: 'Esta operación no está disponible públicamente.' },
    { status: 404 },
  );
}
