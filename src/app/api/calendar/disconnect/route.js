/**
 * POST /api/calendar/disconnect
 * Disconnect Google Calendar — clears calendar cookies for the authenticated user.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const cookieStore = await cookies();
    cookieStore.delete('calendar_access_token');
    cookieStore.delete('calendar_refresh_token');

    return NextResponse.json({ success: true, message: 'Disconnected from Google Calendar' });
  } catch (error) {
    console.error('[disconnect] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error disconnecting from calendar' },
      { status: 500 },
    );
  }
}
