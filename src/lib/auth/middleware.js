import { NextResponse } from 'next/server';
import { verifyToken } from './jwt';
import prisma from '../prisma';

const COOKIE_NAME = 'calico_auth_token';

/**
 * Extract the JWT from the request.
 * Priority: Authorization Bearer header → HttpOnly cookie.
 * This dual-source support lets API clients keep using the header while
 * the browser relies on the cookie set at login (XSS-safe).
 */
function extractToken(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Next.js App Router exposes cookies on the request object
  return request.cookies?.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Verify that a freshly-verified JWT payload still reflects the user's
 * current state in the DB: the account must still be active, and the
 * token's `tokenVersion` must match the one currently on the user record.
 * `tokenVersion` is bumped on password change/reset, so this is what makes
 * those flows actually invalidate previously-issued tokens instead of
 * leaving them valid until natural expiry.
 *
 * @returns {Promise<{ error: string, code: string } | null>} null when fresh
 */
async function checkSessionFreshness(payload) {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { isActive: true, tokenVersion: true },
  });

  if (!user || !user.isActive) {
    return { error: 'Account disabled', code: 'ACCOUNT_DISABLED' };
  }

  const payloadVersion = payload.tokenVersion ?? 0;
  const currentVersion = user.tokenVersion ?? 0;
  if (payloadVersion !== currentVersion) {
    return { error: 'Token revoked', code: 'TOKEN_REVOKED' };
  }

  return null;
}

/**
 * Authenticate an incoming API request.
 *
 * On success, returns the decoded JWT payload.
 * On failure, returns a NextResponse with the appropriate HTTP status.
 */
export async function authenticateRequest(request) {
  const token = extractToken(request);

  if (!token) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header' },
      { status: 401 },
    );
  }

  const result = verifyToken(token);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 401 },
    );
  }

  const staleness = await checkSessionFreshness(result.payload);
  if (staleness) {
    return NextResponse.json(staleness, { status: 401 });
  }

  return result.payload;
}

/**
 * Same as authenticateRequest but returns null instead of a 401 response
 * when no token is present or the token is invalid.
 * Used to optionally enrich responses (e.g. personalised tutor pages).
 */
export async function tryAuthenticateRequest(request) {
  const token = extractToken(request);
  if (!token) return null;

  const result = verifyToken(token);
  if (!result.success) return null;

  const staleness = await checkSessionFreshness(result.payload);
  if (staleness) return null;

  return result.payload;
}

/**
 * Build the Set-Cookie header value for the auth token.
 * Exported so login / google-auth / logout routes stay in sync.
 *
 * @param {string|null} token  JWT to store, or null to clear the cookie.
 * @param {number}      [maxAge]  Seconds. Defaults to 3600 (1 h). Pass 0 to expire immediately.
 */
export function buildAuthCookieHeader(token, maxAge = 3600) {
  const isProduction = process.env.NODE_ENV === 'production';
  const value = token ?? '';
  const parts = [
    `${COOKIE_NAME}=${value}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}
