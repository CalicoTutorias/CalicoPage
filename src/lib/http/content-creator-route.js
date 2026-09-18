/**
 * Wrapper for /api/content-creator/* route handlers.
 *
 * - Authenticates the personal token (requireContentCreator).
 * - Parses the JSON body on write verbs (400 on malformed JSON).
 * - Maps service errors: VALIDATION_ERROR → 400, NOT_FOUND → 404,
 *   CONFLICT → 409 (with `currentVersion`), anything else → 500.
 * - Responses are private and never cached.
 */

import { NextResponse } from 'next/server';
import { requireContentCreator } from '@/lib/auth/guards';

const STATUS = { VALIDATION_ERROR: 400, NOT_FOUND: 404, CONFLICT: 409 };
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const ok = (data, status = 200) =>
  NextResponse.json({ success: true, ...data }, { status, headers: NO_STORE });

/**
 * @param {string} tag  route label for server logs, e.g. 'PUT /api/content-creator/pieces/[slug]'
 * @param {(ctx: { request: Request, actor: object, params: object, body: any }) => Promise<Response>} handler
 */
export function contentCreatorRoute(tag, handler) {
  return async (request, context = {}) => {
    const actor = await requireContentCreator(request);
    if (actor instanceof NextResponse) return actor;

    let body = null;
    if (!['GET', 'HEAD', 'DELETE'].includes(request.method)) {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400, headers: NO_STORE });
      }
    }

    try {
      const params = (await context.params) || {};
      return await handler({ request, actor, params, body });
    } catch (err) {
      const status = STATUS[err.code];
      if (status) {
        return NextResponse.json(
          { success: false, error: err.message, code: err.code, ...(err.currentVersion && { currentVersion: err.currentVersion }) },
          { status, headers: NO_STORE },
        );
      }
      console.error(`[${tag}]:`, err.message);
      return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500, headers: NO_STORE });
    }
  };
}
