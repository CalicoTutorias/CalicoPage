import { NextResponse } from 'next/server';
import { authenticateRequest } from './middleware';
import { rateLimit } from './rateLimit';
import prisma from '../prisma';

/**
 * Verify the request carries the correct admin secret header.
 * Requires ADMIN_SECRET env var and `x-admin-secret: <value>` in the request.
 *
 * Reserved for service-to-service / cron-job use. For human admin actions,
 * use {@link requireAdminUser} instead so we get the actor's identity for
 * audit logging.
 *
 * @param {Request} request
 * @returns {true | NextResponse}
 */
export function requireAdminSecret(request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.error('[requireAdminSecret] ADMIN_SECRET env var is not configured');
    return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 });
  }

  const provided = request.headers.get('x-admin-secret');
  if (!provided || provided !== secret) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  return true;
}

/** @deprecated Use `requireAdminSecret` (renamed) or `requireAdminUser` (for human admins). */
export const requireAdmin = requireAdminSecret;

/**
 * Authenticate the request AND verify the user has `role = 'ADMIN'` in DB.
 *
 * The role is looked up from the database on every call (NOT trusted from the
 * JWT). This means promoting/demoting an admin via SQL takes effect on the
 * next request without requiring the user to re-login.
 *
 * On success returns the JWT payload extended with the fresh `role`. On
 * failure returns a NextResponse error.
 *
 * Usage:
 * ```js
 * const auth = await requireAdminUser(request);
 * if (auth instanceof NextResponse) return auth;
 * const adminId = auth.sub;
 * ```
 *
 * @param {Request} request
 * @returns {Promise<{ sub: string, email: string, role: string } | NextResponse>}
 */
export async function requireAdminUser(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'USER_NOT_FOUND' },
      { status: 401 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { success: false, error: 'ACCOUNT_DISABLED' },
      { status: 403 },
    );
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, error: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  // Stop runaway scripts / flooding: 30 admin requests per minute per user.
  const limited = rateLimit(`admin:${user.id}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  return { ...auth, role: user.role };
}

/**
 * Lightweight role check: does this user have `role = 'ADMIN'` in the DB?
 *
 * Use when a route is owner-scoped but should ALSO allow admins through
 * (e.g. "the tutor themselves OR an admin may read these payments"). Returns
 * a plain boolean — unlike {@link requireAdminUser}, it does not short-circuit
 * with a NextResponse, so the caller can fall back to its own owner check.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isAdmin(userId) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { role: true, isActive: true },
  });
  return Boolean(user && user.isActive && user.role === 'ADMIN');
}

/**
 * Authenticate the request AND verify the user is an approved tutor.
 * Returns the decoded JWT payload on success, or a NextResponse error.
 *
 * `isTutorApproved` and `isActive` are re-read from the DB on every call
 * (NOT trusted from the JWT) so revoking tutor approval or suspending the
 * account takes effect on the very next request, not after the token expires.
 *
 * Usage:
 * ```js
 * const auth = await requireTutor(request);
 * if (auth instanceof NextResponse) return auth;
 * const tutorId = auth.sub;
 * ```
 *
 * @param {Request} request
 * @returns {Promise<object | NextResponse>}
 */
export async function requireTutor(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { isTutorApproved: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json(
      { success: false, error: 'ACCOUNT_DISABLED' },
      { status: 403 },
    );
  }

  if (!user.isTutorApproved) {
    return NextResponse.json(
      { success: false, error: 'TUTOR_NOT_APPROVED' },
      { status: 403 },
    );
  }

  return { ...auth, isTutorApproved: user.isTutorApproved };
}
