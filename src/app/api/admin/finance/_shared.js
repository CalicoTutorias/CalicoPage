/**
 * Shared zod pieces + error mapping for the finance (ledger) routes and for
 * every route that records a transfer the ledger needs (tutor payouts,
 * refunds): which account the money left, when, and its proof.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** Fields of a money account (create: all but isActive; update: any). */
export const accountFields = {
  name: z.string().trim().min(1).max(80),
  type: z.enum(['WOMPI', 'BANK', 'CASH']),
  gmfApplies: z.boolean(),
  isActive: z.boolean(),
};

/** Account, date and proof of a transfer. All optional here; the service decides what is required. */
export const transferFields = {
  accountId: z.string().uuid().optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
  proofS3Key: z.string().max(200).optional(),
};

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export function invalidBody(parsed) {
  const issue = parsed.error.issues[0];
  return NextResponse.json(
    { success: false, error: issue?.message ?? 'Datos inválidos', field: issue?.path?.join('.') || null },
    { status: 422 },
  );
}

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  CUTOFF_LOCKED: 409,
  NOT_CONFIGURED: 409,
  INVALID_INPUT: 400,
};

/** Domain error → JSON response; anything else is a logged 500. */
export function financeErrorResponse(err, tag) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json(
      { success: false, error: err.message, code: err.code, field: err.field ?? null, rule: err.rule ?? null },
      { status },
    );
  }
  console.error(`[${tag}]`, err);
  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}
