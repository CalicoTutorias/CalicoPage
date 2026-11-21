/**
 * POST /api/auth/verify-university-email { token } — confirms the link sent by
 * POST /api/users/me/university-email. Needs no session: the link is often
 * opened on another device (the phone's mail app). The token is single-use,
 * 32 random bytes, stored only as a hash.
 *
 * 200 { status: 'success', university } | 400 { status: 'invalid' | 'expired' | 'unsupported' }
 * | 409 { status: 'taken' }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import * as universityEmailService from '@/lib/services/university-email.service';

export async function POST(request) {
  const limited = rateLimit(`verify-university-email:${getClientIp(request)}`, { max: 20, windowMs: 15 * 60_000 });
  if (limited) return limited;

  let token;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ success: false, status: 'invalid' }, { status: 400 });
  }

  try {
    const result = await universityEmailService.verifyToken(token);
    const httpStatus = result.status === 'success' ? 200 : result.status === 'taken' ? 409 : 400;
    return NextResponse.json({ success: result.status === 'success', ...result }, { status: httpStatus });
  } catch (err) {
    console.error('[POST /api/auth/verify-university-email]:', err?.message);
    return NextResponse.json({ success: false, status: 'error' }, { status: 500 });
  }
}
