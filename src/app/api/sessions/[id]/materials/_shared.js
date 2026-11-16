/**
 * Shared by the /api/sessions/[id]/materials routes: who is calling and the map
 * from the service's business codes to HTTP. The code travels as `error` so the
 * page can show its translated message; anything else is a generic 500.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { isAdmin } from '@/lib/auth/guards';
import { rateLimit } from '@/lib/auth/rateLimit';

const STATUS_BY_CODE = {
  MATERIAL_NAME_REQUIRED: 400,
  MATERIAL_TYPE_INVALID: 400,
  MATERIAL_SIZE_INVALID: 400,
  MATERIAL_TOO_LARGE: 400,
  MATERIAL_KEY_INVALID: 400,
  MATERIAL_NOT_UPLOADED: 400,
  FORBIDDEN: 403,
  MATERIALS_LOCKED: 403,
  SESSION_NOT_FOUND: 404,
  MATERIAL_NOT_FOUND: 404,
  SESSION_NOT_ELIGIBLE: 409,
  MATERIAL_LIMIT: 409,
  MATERIAL_DUPLICATE: 409,
};

export const uuidSchema = z.string().uuid();

/**
 * The actor the service expects, with the identity taken from the JWT and the
 * role read fresh from the database. Returns a NextResponse on failure.
 */
export async function authenticateActor(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`session-materials:${auth.sub}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;
  return { id: auth.sub, isAdmin: await isAdmin(auth.sub) };
}

export function invalidInput() {
  return NextResponse.json({ success: false, error: 'INVALID_INPUT' }, { status: 422 });
}

export function materialErrorResponse(err, label) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json({ success: false, error: err.code }, { status });
  }
  console.error(`[${label}]`, err);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
