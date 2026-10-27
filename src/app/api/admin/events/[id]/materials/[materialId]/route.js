/**
 * DELETE /api/admin/events/[id]/materials/[materialId]
 *
 * Remove one study-material file: its row (students lose access at once) and
 * its S3 object.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../../_schemas';

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id, materialId } = await params;
  if (!eventIdSchema.safeParse(id).success || !eventIdSchema.safeParse(materialId).success) return invalidEventId();

  try {
    await eventMaterialService.deleteMaterial({ adminId: auth.sub, eventId: id, materialId, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    return eventErrorResponse(err, 'DELETE /api/admin/events/[id]/materials/[materialId]');
  }
}
