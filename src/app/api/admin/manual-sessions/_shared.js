/**
 * Shared by the /api/admin/manual-sessions routes: input schemas and the map
 * from the service's business codes to HTTP. The code travels as `error` so the
 * page can show its translated message; anything else is a generic 500.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

const STATUS_BY_CODE = {
  INVALID_STUDENT_PHONE: 400,
  INVALID_WHATSAPP_TAG: 400,
  STUDENT_CONTACT_REQUIRED: 400,
  TUTOR_NOT_APPROVED: 400,
  COURSE_NOT_OFFERED: 400,
  COURSE_NOT_FOUND: 400,
  NO_PRICE: 400,
  BAD_INTERVAL: 400,
  SELF_BOOKING: 400,
  PAYMENT_IS_NOT_MANUAL: 400,
  PROOF_INVALID_TYPE: 400,
  PROOF_TOO_LARGE: 400,
  PROOF_KEY_INVALID: 400,
  PROOF_NOT_UPLOADED: 400,
  PAYMENT_NOT_FOUND: 404,
  PROOF_NOT_FOUND: 404,
  SLOT_NOT_AVAILABLE: 409,
  SESSION_CONFLICT: 409,
  STUDENT_CONTACT_CONFLICT: 409,
  PAYMENT_ALREADY_PAID: 409,
  SESSION_NOT_PAYABLE: 409,
};

export function manualSessionErrorResponse(err, label) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json({ success: false, error: err.code }, { status });
  }
  console.error(`[${label}]`, err);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export function invalidInput(error = 'INVALID_INPUT') {
  return NextResponse.json({ success: false, error }, { status: 422 });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
