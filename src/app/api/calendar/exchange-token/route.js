/**
 * POST /api/calendar/exchange-token
 * Exchange a Google authorization code for tokens (programmatic API clients only).
 * Requires Calico authentication.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calendarService from '../../../../lib/services/calendar.service';

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'No authorization code provided' },
        { status: 400 },
      );
    }

    const tokens = await calendarService.exchangeCodeForTokens(code);

    return NextResponse.json({
      success: true,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        token_type: tokens.token_type || 'Bearer',
      },
    });
  } catch (error) {
    console.error('[exchange-token] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Error exchanging authorization code' },
      { status: 500 },
    );
  }
}
