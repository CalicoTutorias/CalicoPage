/**
 * PATCH /api/users/me/profile-picture
 *   Confirm a freshly-uploaded picture: verifies the S3 object exists under
 *   the requester's prefix, persists the public URL on the User row, and
 *   cleans up the previous picture from S3.
 *
 * DELETE /api/users/me/profile-picture
 *   Remove the user's profile picture (clears the field + deletes from S3).
 *
 * Auth: Required. Identity is taken from the JWT (`auth.sub`).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as profilePictureService from '@/lib/services/profile-picture.service';

const patchBodySchema = z.object({
  s3Key: z
    .string({
      required_error: 'La clave S3 es requerida',
      invalid_type_error: 'La clave S3 es requerida',
    })
    .min(1, 'La clave S3 es requerida')
    .max(512, 'Clave S3 demasiado larga'),
});

export async function PATCH(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Datos inválidos';
      return NextResponse.json(
        { success: false, error: firstError, details: parsed.error.issues },
        { status: 400 },
      );
    }

    const result = await profilePictureService.confirmProfilePicture(
      auth.sub,
      parsed.data.s3Key,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    if (err.code === 'FORBIDDEN') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 403 },
      );
    }
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    console.error('[PATCH /api/users/me/profile-picture]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al confirmar la foto de perfil' },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await profilePictureService.deleteProfilePicture(auth.sub);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[DELETE /api/users/me/profile-picture]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al eliminar la foto de perfil' },
      { status: 500 },
    );
  }
}
