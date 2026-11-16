/**
 * POST /api/admin/manual-sessions/[sessionId]/payment-proof
 *   Body { s3Key }. Registers the uploaded screenshot and marks the payment as
 *   paid: this is the only way a manual payment becomes `paid`. Returns the
 *   updated row as { session }.
 * GET  /api/admin/manual-sessions/[sessionId]/payment-proof
 *   Short-lived presigned URL to look at the proof, as { url }.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { invalidInput, manualSessionErrorResponse, readJson, uuidSchema } from '../../_shared';

const bodySchema = z.object({ s3Key: z.string().min(1).max(512) });

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) return invalidInput('INVALID_SESSION_ID');

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput();

  try {
    const session = await manualSessionService.attachPaymentProof({
      sessionId,
      s3Key: parsed.data.s3Key,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, session });
  } catch (err) {
    return manualSessionErrorResponse(err, 'POST /api/admin/manual-sessions/[sessionId]/payment-proof');
  }
}

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) return invalidInput('INVALID_SESSION_ID');

  try {
    const url = await manualSessionService.getPaymentProofUrl({ sessionId });
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions/[sessionId]/payment-proof');
  }
}
