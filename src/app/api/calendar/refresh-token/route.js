/**
 * Refresh Token API Route
 * POST /api/calendar/refresh-token - Refresh calendar access token
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * POST /api/calendar/refresh-token
 */
export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('calendar_refresh_token')?.value;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No refresh token available',
        },
        { status: 401 }
      );
    }

    const newTokens = await calendarService.refreshAccessToken(refreshToken);

    // Update access token cookie
    cookieStore.set('calendar_access_token', newTokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600, // 1 hour
      sameSite: 'lax',
      path: '/',
    });

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    console.error('[calendar/refresh-token] failed', { code: error?.code || 'CALENDAR_REFRESH_FAILED' });
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh token',
      },
      { status: 500 }
    );
  }
}
