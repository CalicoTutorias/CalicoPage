/**
 * POST /api/admin/news/image/presigned-url
 *
 * Generate a presigned S3 PUT URL so an admin can upload a news image
 * directly to S3 (server never proxies the bytes).
 *
 * Auth: requireAdminUser. Key is generated server-side under news-images/.
 *
 * Body (Zod): { mimeType: 'image/jpeg'|'image/png'|'image/webp', fileSize: number }
 * Returns:    { success: true, uploadUrl, s3Key }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as newsService from '@/lib/services/news.service';

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
    return NextResponse.json(
      { success: false, error: 'Cuerpo JSON inválido' },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    );
  }

  try {
    const result = await newsService.generateNewsImageUploadUrl(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/news/image/presigned-url]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al generar URL de subida' },
      { status: 500 },
    );
  }
}
