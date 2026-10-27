/**
 * GET /api/calendar/check-connection
 * Returns the Google Calendar connection status for the authenticated user.
 *
 * Response 200: { connected, status, refreshed, connectedAt }
 *   status — 'connected' | 'not_connected' | 'reauth_required' | 'encryption_unavailable'
 *   'reauth_required' means Google rejected the stored refresh token: the tutor
 *   must go through "Continuar con Google" again.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarCredentialService from '@/lib/services/calendar-credential.service';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const status = await calendarCredentialService.getConnectionStatus(auth.sub);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[calendar/check-connection] failed', { code: error?.code || 'CALENDAR_CONNECTION_CHECK_FAILED' });
    return NextResponse.json(
      { connected: false, status: 'error', refreshed: false, connectedAt: null },
      { status: 500 },
    );
  }
}
