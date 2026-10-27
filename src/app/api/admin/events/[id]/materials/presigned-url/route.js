/**
 * POST /api/admin/events/[id]/materials/presigned-url
 *
 * Presigned S3 PUT for one study-material file of the event (Published
 * events only). The key is generated server-side under the event's folder
 * (layout: src/lib/events/event-materials.js). The browser must PUT with the
 * returned `contentType` and `x-amz-tagging: status=unconfirmed`, then
 * register the file with POST ../materials.
 *
 * Auth: requireAdminUser.
 * Body (Zod): { fileName: string, fileSize: number }
 * Returns:    { success: true, uploadUrl, s3Key, contentType }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../../_schemas';

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive('El tamaño debe ser mayor a 0'),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const result = await eventMaterialService.generateMaterialUploadUrl({ eventId: id, ...parsed.data });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/materials/presigned-url');
  }
}
