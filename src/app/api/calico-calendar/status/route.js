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
    const isConfigured = calicoCalendarService.isConfigured();
    
    return NextResponse.json({
      configured: isConfigured,
      message: isConfigured
        ? 'Calico Calendar service is ready'
        : 'Calico Calendar service is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and CALICO_CALENDAR_ID in .env',
    });
  } catch (error) {
    console.error('Error checking Calico Calendar status:', error);
    return NextResponse.json(
      {
        configured: false,
        error: error.message || 'Error checking status',
      },
      { status: 500 }
    );
  }
}

