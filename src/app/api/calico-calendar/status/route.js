/**
 * Calico Calendar Status API Route
 * GET /api/calico-calendar/status - Check if service is configured
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '../../../../lib/services/calico-calendar.service';

/**
 * GET /api/calico-calendar/status
 */
export async function GET(request) {
  try {
    const status = await calicoCalendarService.verifyConnection();

    let message;
    if (!status.configured) {
      message =
        'Calico Calendar service is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADMIN_REFRESH_TOKEN and CALICO_CALENDAR_ID in .env';
    } else if (status.connected) {
      message = 'Calico Calendar service is ready';
    } else if (status.reason === 'token_expired') {
      message =
        'Calico Calendar admin token is expired or revoked. Regenerate GOOGLE_ADMIN_REFRESH_TOKEN and make sure the OAuth consent screen is published "In production" so the new token does not expire.';
    } else {
      message = 'Calico Calendar service error: could not reach Google Calendar.';
    }

    return NextResponse.json({
      configured: status.configured,
      connected: status.connected,
      reason: status.reason,
      message,
    });
  } catch (error) {
    console.error('Error checking Calico Calendar status:', error);
    return NextResponse.json(
      {
        configured: false,
        error: 'Error checking status',
      },
      { status: 500 }
    );
  }
}

