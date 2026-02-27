/**
 * Exchange Token API Route
 * POST /api/calendar/exchange-token - Exchange authorization code for tokens (for API clients)
 */

import { NextResponse } from 'next/server';
import * as calendarService from '../../../../lib/services/calendar.service';

/**
 * POST /api/calendar/exchange-token
 * Query params: code (required)
 */
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: 'No authorization code provided',
        },
        { status: 400 }
      );
    }

    const tokens = await calendarService.exchangeCodeForTokens(code);

    return NextResponse.json({
      success: true,
      message: 'Tokens obtained successfully',
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        token_type: tokens.token_type || 'Bearer',
      },
      instructions: {
        method1: 'Use access_token in Authorization header: Bearer <access_token>',
        method2: 'Store refresh_token to get new access tokens when expired',
        method3: 'For cookie-based auth, use the /callback endpoint instead',
      },
    });
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error exchanging authorization code',
      },
      { status: 500 }
    );
  }
}

