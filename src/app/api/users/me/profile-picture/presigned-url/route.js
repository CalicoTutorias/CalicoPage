/**
 * POST /api/users/me/profile-picture/presigned-url
 *
 * Generate a presigned S3 PUT URL so the client can upload their (already
 * compressed) profile picture directly to S3.
 *
 * Auth: Required. Identity is taken from the JWT (`auth.sub`) — never from
 *       the body — to prevent IDOR.
 *
 * Body (validated with Zod):
 *   { mimeType: 'image/jpeg' | 'image/png' | 'image/webp', fileSize: number }
 *
 * Returns:
 *   { success: true, uploadUrl: string, s3Key: string }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as profilePictureService from '@/lib/services/profile-picture.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB — keep in sync with service.

const bodySchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({
      message: 'Tipo de imagen no permitido. Usa JPG, PNG o WebP.',
    }),
  }),
  fileSize: z
    .number()
    .int()
    .positive('El tamaño debe ser mayor a 0')
    .max(MAX_FILE_SIZE, `La imagen no puede exceder ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

export async function POST(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Datos inválidos';
      return NextResponse.json(
        { success: false, error: firstError, details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await profilePictureService.generateProfilePictureUploadUrl(
      auth.sub,
      parsed.data,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    console.error('[POST /api/users/me/profile-picture/presigned-url]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al generar URL de subida' },
      { status: 500 },
    );
  }
}
