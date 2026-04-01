import { NextResponse } from 'next/server';
import { authenticateRequest } from './middleware';

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
