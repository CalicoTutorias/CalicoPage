/**
 * Calendar OAuth Callback API Route
 * GET /api/calendar/callback - Handle OAuth callback from Google
 */

import { NextResponse } from 'next/server';
import * as calendarService from '../../../../lib/services/calendar.service';
import { cookies } from 'next/headers';

/**
 * GET /api/calendar/callback
 * Query params: code (required), format (optional), state (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const format = searchParams.get('format');
    const state = searchParams.get('state');

    if (!code) {
      const useJsonFormat = format === 'json' || state === 'format=json';
      if (useJsonFormat) {
        return NextResponse.json(
          {
            success: false,
            error: 'No authorization code provided',
          },
          { status: 400 }
        );
      }

      const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${frontendUrl}/calendar-error?error=${encodeURIComponent('No authorization code provided')}`);
    }

    // Determine format from query param or state parameter
    const useJsonFormat = format === 'json' || state === 'format=json';

    console.log(`Processing OAuth callback with code. Format: ${useJsonFormat ? 'json' : 'redirect'}`);

    const tokens = await calendarService.exchangeCodeForTokens(code);

    console.log('Tokens obtained successfully');

    // If format=json, return tokens as JSON
    if (useJsonFormat) {
      return NextResponse.json({
        success: true,
        message: 'Authorization successful',
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
          token_type: tokens.token_type || 'Bearer',
        },
      });
    }

    // Otherwise, set cookies and redirect to frontend
    const cookieStore = cookies();
    
    cookieStore.set('calendar_access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 3600, // 1 hour
      sameSite: 'lax',
      path: '/',
    });

    if (tokens.refresh_token) {
      cookieStore.set('calendar_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'lax',
        path: '/',
      });
    }

    // Redirect to frontend
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    console.log(`Redirecting to frontend: ${frontendUrl}/tutor/disponibilidad`);
    
    return NextResponse.redirect(`${frontendUrl}/tutor/disponibilidad?calendar_connected=true`);
  } catch (error) {
    console.error('Error in calendar callback:', error);
    console.error(`Error details: ${JSON.stringify(error)}`);

    // Check for redirect_uri_mismatch error
    if (error.message && error.message.includes('redirect_uri_mismatch')) {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';
      console.error(`Redirect URI mismatch! Current: ${redirectUri}`);
      console.error('Make sure this exact URI is registered in Google Cloud Console');
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    const state = searchParams.get('state');
    const useJsonFormat = format === 'json' || state === 'format=json';

    if (useJsonFormat) {
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Error processing authorization',
          details: error.message?.includes('redirect_uri_mismatch')
            ? 'The redirect URI used does not match what is registered in Google Cloud Console'
            : undefined,
        },
        { status: 500 }
      );
    }

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${frontendUrl}/calendar-error?error=${encodeURIComponent(error.message || 'Unknown error')}&calendar_connected=false`
    );
  }
}

