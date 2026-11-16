/**
 * POST /api/admin/finance/proofs/presigned-url
 *
 * Presigned S3 PUT for a finance proof (transfer to a tutor, refund, expense,
 * opening balance). The key is generated server-side. The browser must PUT
 * with the returned `contentType` and `x-amz-tagging: status=unconfirmed`,
 * then send `s3Key` with the action that needs it (the server checks it).
 *
 * Auth: requireAdminUser.
 * Body: { mimeType: string, fileSize: number }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson } from '../../_shared';

const bodySchema = z.object({
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const result = await financeService.generateProofUploadUrl(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/proofs/presigned-url');
  }
}
