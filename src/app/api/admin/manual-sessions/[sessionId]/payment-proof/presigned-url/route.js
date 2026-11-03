/**
 * POST /api/admin/manual-sessions/[sessionId]/payment-proof/presigned-url
 *
 * Presigned S3 PUT for the screenshot of the student's payment. The key is
 * generated server-side under the session's folder. The browser must PUT with
 * the returned `contentType` and `x-amz-tagging: status=unconfirmed`, then
 * register the file with POST ../payment-proof.
 *
 * Auth: requireAdminUser.
 * Body (Zod): { mimeType: string, fileSize: number }
 * Returns:    { success: true, uploadUrl, s3Key, contentType }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { invalidInput, manualSessionErrorResponse, readJson, uuidSchema } from '../../../_shared';

const bodySchema = z.object({
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) return invalidInput('INVALID_SESSION_ID');

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput();

  try {
    const result = await manualSessionService.generatePaymentProofUploadUrl({ sessionId, ...parsed.data });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return manualSessionErrorResponse(err, 'POST /api/admin/manual-sessions/[sessionId]/payment-proof/presigned-url');
  }
}
