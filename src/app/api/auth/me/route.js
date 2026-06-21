/**
 * GET /api/auth/me
 * Returns the authenticated user's profile data.
 * Used by the frontend to validate the JWT on app mount.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userRepository from '@/lib/repositories/user.repository';

// Refresh `lastSeenAt` at most once per this window per user, so the
// engagement metric stays fresh without an UPDATE on every /me call.
const LAST_SEEN_THROTTLE_MS = 30 * 60 * 1000; // 30 min

export async function GET(request) {
  const auth = await authenticateRequest(request);
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

  // Heartbeat: this endpoint runs whenever the app validates the session
  // (mount/reload), so it's the reliable "last seen" signal even though the
  // JWT persists and explicit logins are rare. Throttled + fire-and-forget.
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeen > LAST_SEEN_THROTTLE_MS) {
    userRepository.touchLastSeen(user.id).catch((err) => {
      console.warn('[auth/me] touchLastSeen failed:', err?.message);
    });
  }

  return NextResponse.json({ success: true, user });
}
