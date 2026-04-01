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

  return NextResponse.json({ success: true, user });
}
