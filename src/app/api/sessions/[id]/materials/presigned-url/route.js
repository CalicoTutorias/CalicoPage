/**
 * POST /api/sessions/:id/materials/presigned-url
 * Presigned PUT for one material file. The browser must send the returned
 * `contentType` and `x-amz-tagging: status=unconfirmed`, then register the file.
 *
 * Auth: the session's tutor or an admin (enforced by the service). 30 calls/min.
 * Body: { fileName, fileSize }. Returns: { success: true, uploadUrl, s3Key, contentType }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as sessionMaterialService from '@/lib/services/session-material.service';
import { authenticateActor, invalidInput, materialErrorResponse, readJson, uuidSchema } from '../_shared';

const bodySchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
});

export async function POST(request, { params }) {
  const actor = await authenticateActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return invalidInput();

  try {
    const result = await sessionMaterialService.generateUploadUrl({ sessionId: id, actor, ...parsed.data });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return materialErrorResponse(err, 'POST /api/sessions/[id]/materials/presigned-url');
  }
}
