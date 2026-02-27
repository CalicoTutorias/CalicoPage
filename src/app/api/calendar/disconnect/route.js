/**
 * Disconnect Calendar API Route
 * POST /api/calendar/disconnect - Disconnect calendar and clear cookies
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /api/calendar/disconnect
 */
export async function POST(request) {
  try {
    const cookieStore = cookies();
    
    // Clear calendar cookies
    cookieStore.delete('calendar_access_token');
    cookieStore.delete('calendar_refresh_token');

    return NextResponse.json({
      success: true,
      message: 'Disconnected from Google Calendar',
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error disconnecting from calendar',
      },
      { status: 500 }
    );
  }
}

