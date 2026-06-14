/**
 * Email verification endpoint.
 *
 * POST /api/auth/verify-email   { token }  → validates the token and marks the
 *   user as verified. This is the ONLY state-mutating path and is triggered by
 *   an explicit user click on the frontend confirmation page.
 *
 * GET /api/auth/verify-email?token=XXX → does NOT mutate state. It only
 *   redirects to the frontend confirmation page carrying the token. Kept for
 *   backward compatibility with verification emails sent before this change.
 *   Crucially, email security scanners (Microsoft Defender Safe Links, link
 *   previews, antivirus) prefetch links with GET — routing that GET through a
 *   harmless redirect prevents them from auto-verifying accounts.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as userService from '@/lib/services/user.service';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  const url = new URL('/auth/confirm-email', baseUrl);
  if (token && typeof token === 'string' && token.length <= 128) {
    url.searchParams.set('token', token);
  }
  return NextResponse.redirect(url.toString());
}

export async function POST(request) {
  // 20 attempts / 15 min per IP — verification tokens are one-time-use and
  // long enough to resist brute-force, but throttling stops enumeration loops.
  const limited = rateLimit(`verify-email:${getClientIp(request)}`, { max: 20, windowMs: 15 * 60_000 });
  if (limited) return limited;

  try {
    let token;
    try {
      ({ token } = await request.json());
    } catch {
      return NextResponse.json({ success: false, status: 'error' }, { status: 400 });
    }

    if (!token || typeof token !== 'string' || token.length > 128) {
      return NextResponse.json({ success: false, status: 'error' }, { status: 400 });
    }

    const { status } = await userService.verifyEmailToken(token);

    // 'success' | 'already' → 200; 'expired' | 'invalid' → 400
    const ok = status === 'success' || status === 'already';
    return NextResponse.json(
      { success: ok, status },
      { status: ok ? 200 : 400 },
    );
  } catch (error) {
    console.error('Error in POST /api/auth/verify-email:', error);
    return NextResponse.json({ success: false, status: 'error' }, { status: 500 });
  }
}
