/**
 * POST /api/auth/logout
 * Clears the HttpOnly auth cookie. Safe to call even when already logged out.
 */

import { NextResponse } from 'next/server';
import { buildAuthCookieHeader } from '@/lib/auth/middleware';

export async function POST() {
  const response = NextResponse.json({ success: true });
  // Pass null + maxAge=0 to expire the cookie immediately
  response.headers.set('Set-Cookie', buildAuthCookieHeader(null, 0));
  return response;
}
