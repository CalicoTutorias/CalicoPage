/**
 * Shared helpers for the public / student event routes: service error
 * mapping and the registration body (register + checkout).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

const STATUS = {
  EVENT_NOT_FOUND: 404, EVENT_NOT_OPEN: 409, ALREADY_REGISTERED: 409, NOT_REGISTERED: 409, EVENT_TUTOR: 409,
  EVENT_IS_FREE: 400, EVENT_IS_PAID: 400, REFUND_DETAILS_REQUIRED: 400,
  SURVEY_NOT_AVAILABLE: 409, SURVEY_ALREADY_SUBMITTED: 409, INVALID_SURVEY: 400,
};

export function eventsErrorResponse(err, tag) {
  const status = STATUS[err?.code];
  if (status) return NextResponse.json({ success: false, error: err.code }, { status });
  console.error(`[${tag}]`, err?.message);
  return NextResponse.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 });
}

export const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;

export function invalidBody() {
  return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400 });
}

/** Parsed JSON body; `{}` when empty, null when it is not valid JSON. */
export async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const registrationBodySchema = z.object({ marketingOptIn: z.boolean().optional() });
const sourceSchema = z.string().trim().toLowerCase().regex(SOURCE_RE);

/**
 * Register / checkout body. An invalid `source` (?ref= tracking) is dropped,
 * not rejected: a bad link must never block a registration.
 * @returns {{ source?: string, marketingOptIn?: boolean } | null} null = invalid body
 */
export function parseRegistrationBody(body) {
  const parsed = registrationBodySchema.safeParse(body);
  if (!parsed.success) return null;
  const source = sourceSchema.safeParse(body.source);
  return { source: source.success ? source.data : undefined, marketingOptIn: parsed.data.marketingOptIn };
}
