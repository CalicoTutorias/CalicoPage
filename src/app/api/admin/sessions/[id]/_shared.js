/**
 * Shared by the /api/admin/sessions/[id] routes: input validation and the map
 * from admin-session-detail.service business codes to HTTP. The code travels
 * as `error` so the page can show its translated message.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

const STATUS_BY_CODE = {
  SESSION_NOT_FOUND: 404,
  TUTOR_NOT_OFFERING: 400,
  SAME_TUTOR: 400,
  SELF_BOOKING: 400,
  SESSION_NOT_REASSIGNABLE: 409,
  SESSION_ENDED: 409,
  TUTOR_ALREADY_PAID: 409,
  PACKAGE_SESSION: 409,
  SESSION_HAS_REVIEWS: 409,
  SESSION_CONFLICT: 409,
  SESSION_CHANGED: 409,
};

export const uuidSchema = z.string().uuid();

export function invalidInput(code = 'INVALID_INPUT') {
  return NextResponse.json({ success: false, error: code }, { status: 422 });
}

export function detailErrorResponse(err, label) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json({ success: false, error: err.code }, { status });
  }
  console.error(`[${label}]`, err);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
