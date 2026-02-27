/**
 * Refresh Token API Route
 * POST /api/calendar/refresh-token - Refresh calendar access token
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * POST /api/calendar/refresh-token
 */
export async function POST(request) {
  try {
    const cookieStore = cookies();
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
    console.error('Error refreshing token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to refresh token',
      },
      { status: 500 }
    );
  }
}

