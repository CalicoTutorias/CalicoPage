/**
 * GET /api/auth/me
 * Returns the authenticated user's profile data.
 * Used by the frontend to validate the JWT on app mount.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userRepository from '@/lib/repositories/user.repository';

export async function GET(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const user = await userRepository.findById(auth.sub);

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'User not found' },
      { status: 404 },
    );
  }

  if (!user.isEmailVerified) {
    return NextResponse.json(
      { success: false, error: 'EMAIL_NOT_VERIFIED' },
      { status: 403 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { success: false, error: 'ACCOUNT_DISABLED' },
      { status: 403 },
    );
  }

  return NextResponse.json({ success: true, user });
}
