/**
 * GET /api/auth/verify-email?token=XXX
 * Validates the email verification token and redirects to the frontend.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as userService from '@/lib/services/user.service';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token || typeof token !== 'string' || token.length > 128) {
      return redirectToStatus('error', request);
    }

    const { status } = await userService.verifyEmailToken(token);

    return redirectToStatus(status, request);
  } catch (error) {
    console.error('Error in GET /api/auth/verify-email:', error);
    return redirectToStatus('error', request);
  }
}

function redirectToStatus(status, request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const url = new URL('/auth/email-verified', baseUrl);
  url.searchParams.set('status', status);
  return NextResponse.redirect(url.toString());
}
