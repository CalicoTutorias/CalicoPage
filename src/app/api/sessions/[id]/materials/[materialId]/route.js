/**
 * DELETE /api/sessions/:id/materials/:materialId
 * Remove a material. A tutor only removes their own files; an admin, any.
 *
 * Auth: enforced by the service; the user is always auth.sub. 30 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as sessionMaterialService from '@/lib/services/session-material.service';
import { authenticateActor, invalidInput, materialErrorResponse, uuidSchema } from '../_shared';

export async function DELETE(request, { params }) {
  const actor = await authenticateActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id, materialId } = await params;
  if (!uuidSchema.safeParse(id).success || !uuidSchema.safeParse(materialId).success) return invalidInput();

  try {
    const result = await sessionMaterialService.deleteMaterial({ sessionId: id, materialId, actor, request });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return materialErrorResponse(err, 'DELETE /api/sessions/[id]/materials/[materialId]');
  }
}
