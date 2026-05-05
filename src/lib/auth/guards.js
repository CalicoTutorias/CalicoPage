import { NextResponse } from 'next/server';
import { authenticateRequest } from './middleware';

/**
 * Verify the request carries the correct admin secret header.
 * Requires ADMIN_SECRET env var and `x-admin-secret: <value>` in the request.
 *
 * @param {Request} request
 * @returns {true | NextResponse}
 */
export function requireAdmin(request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('[requireAdmin] ADMIN_SECRET env var is not configured');
    return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  const provided = request.headers.get('x-admin-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  return true;
}

/**
 * Authenticate the request AND verify the user is an approved tutor.
 * Returns the decoded JWT payload on success, or a NextResponse error.
 *
 * Usage:
 * ```js
 * const auth = requireTutor(request);
 * if (auth instanceof NextResponse) return auth;
 * const tutorId = auth.sub;
 * ```
 *
 * @param {Request} request
 * @returns {object | NextResponse}
 */
export function requireTutor(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  if (!auth.isTutorApproved) {
    return NextResponse.json(
      { success: false, error: 'TUTOR_NOT_APPROVED' },
      { status: 403 },
    );
  }

  return auth;
}
