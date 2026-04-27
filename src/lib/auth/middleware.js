import { NextResponse } from 'next/server';
import { verifyToken } from './jwt';

/**
 * Authenticate an incoming API request by extracting and verifying the Bearer token.
 *
 * On success, returns the decoded payload with user info:
 *   { sub, email, isTutorRequested, isTutorApproved, iat, exp }
 *
 * On failure, returns a NextResponse with the appropriate HTTP status.
 *
 * Usage in API route handlers:
 * ```js
 * export async function GET(request) {
 *   const auth = authenticateRequest(request);
 *   if (auth instanceof NextResponse) return auth; // 401
 *   const userId = auth.sub;
 *   // ...
 * }
 * ```
 *
 * @param {Request} request - The incoming Next.js request
 * @returns {object | NextResponse} Decoded JWT payload or 401 error response
 */
export function authenticateRequest(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header' },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const result = verifyToken(token);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 401 }
    );
  }

  return result.payload;
}

/**
 * Same verification as authenticateRequest, but returns null if missing/invalid token
 * (no 401). Used to optionally enrich responses (e.g. exclude current user from tutor lists).
 *
 * @param {Request} request
 * @returns {{ sub: string, email?: string } | null}
 */
export function tryAuthenticateRequest(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const result = verifyToken(token);

  if (!result.success) return null;
  return result.payload;
}
