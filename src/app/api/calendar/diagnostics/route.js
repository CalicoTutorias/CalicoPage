/**
 * Calendar Diagnostics API Route
 * GET /api/calendar/diagnostics - Check OAuth configuration
 */

import { NextResponse } from 'next/server';

/**
 * GET /api/calendar/diagnostics
 */
export async function GET(request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    const port = process.env.PORT || 3000;

    const issues = [];
    const warnings = [];

    if (!clientId) {
      issues.push('GOOGLE_CLIENT_ID is not set');
    } else if (!clientId.includes('.apps.googleusercontent.com')) {
      warnings.push('GOOGLE_CLIENT_ID format looks incorrect');
    }

    if (!clientSecret) {
      issues.push('GOOGLE_CLIENT_SECRET is not set');
    }

    if (!redirectUri) {
      warnings.push('GOOGLE_REDIRECT_URI is not set - using default');
    } else {
      try {
        const url = new URL(redirectUri);
        if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
          warnings.push('Redirect URI is not localhost - make sure this matches Google Cloud Console');
        }
        if (url.port && url.port !== port.toString()) {
          warnings.push(`Redirect URI port (${url.port}) doesn't match server port (${port})`);
        }
      } catch (e) {
        issues.push('GOOGLE_REDIRECT_URI is not a valid URL');
      }
    }

    // Determine correct redirect URI
    const correctRedirectUri = redirectUri || `http://localhost:${port}/api/calendar/callback`;
    const redirectUriWithFormat = `${correctRedirectUri}?format=json`;

    return NextResponse.json({
      success: issues.length === 0,
      configuration: {
        clientId: clientId ? `${clientId.substring(0, 20)}...` : 'NOT SET',
        clientSecret: clientSecret ? 'SET (hidden)' : 'NOT SET',
        redirectUri: redirectUri || 'NOT SET (will use default)',
        correctRedirectUri,
        redirectUriWithFormat,
        frontendUrl,
        serverPort: port,
      },
      issues,
      warnings,
      instructions: {
        step1: 'Make sure your .env file has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI',
        step2: 'Add these URIs to your Google Cloud Console OAuth 2.0 Client ID authorized redirect URIs:',
        redirectUrisToAdd: [correctRedirectUri, redirectUriWithFormat],
        step3: 'Go to: https://console.cloud.google.com/apis/credentials',
        step4: 'Click on your OAuth 2.0 Client ID',
        step5: 'Under "Authorized redirect URIs", click "ADD URI"',
        step6: `Add: ${correctRedirectUri}`,
        step7: `Add: ${redirectUriWithFormat} (for JSON format)`,
        step8: 'Click "SAVE"',
        step9: 'For API clients, use /api/calendar/auth-url?format=json to get JSON response',
      },
    });
  } catch (error) {
    console.error('Error in diagnostics:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error checking configuration',
      },
      { status: 500 }
    );
  }
}

