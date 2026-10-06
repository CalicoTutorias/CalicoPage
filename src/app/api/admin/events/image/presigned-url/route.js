/**
 * POST /api/admin/events/image/presigned-url
 *
 * Generate a presigned S3 PUT URL so an admin can upload an event cover
 * directly to S3 (server never proxies the bytes). The returned s3Key goes
 * into the event's `coverImageKey` on create/update.
 *
 * Auth: requireAdminUser. Key is generated server-side under event-images/.
 *
 * Body (Zod): { mimeType: 'image/jpeg'|'image/png'|'image/webp', fileSize: number }
 * Returns:    { success: true, uploadUrl, s3Key }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventImageService from '@/lib/services/event-image.service';
import { eventErrorResponse, invalidBody } from '../../_schemas';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with service.

const bodySchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    message: 'Tipo de imagen no permitido. Usa JPG, PNG o WebP.',
  }),
  fileSize: z
    .number()
    .int()
    .positive('El tamaño debe ser mayor a 0')
    .max(MAX_FILE_SIZE, `La imagen no puede exceder ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const result = await eventImageService.generateEventImageUploadUrl(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/image/presigned-url');
  }
}
