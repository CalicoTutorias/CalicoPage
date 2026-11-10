/**
 * GET /api/sessions/:id/materials/:materialId/download
 * A presigned S3 download URL (5 min, Content-Disposition: attachment). Same lock
 * as the list: the student needs a review with a comment (403 MATERIALS_LOCKED).
 *
 * Auth: enforced by the service; the user is always auth.sub. 30 calls/min.
 * Returns: { success: true, url, fileName }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as sessionMaterialService from '@/lib/services/session-material.service';
import { authenticateActor, invalidInput, materialErrorResponse, uuidSchema } from '../../_shared';

export async function GET(request, { params }) {
  const actor = await authenticateActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id, materialId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(materialId).success) return invalidInput();

  try {
    const result = await sessionMaterialService.getMaterialDownloadUrl({ sessionId: id, materialId, actor });
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return materialErrorResponse(err, 'GET /api/sessions/[id]/materials/[materialId]/download');
  }
}
