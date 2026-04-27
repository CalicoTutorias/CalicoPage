/**
 * POST /api/attachments/presigned-urls
 * Generate presigned S3 PUT URLs for uploading session attachments.
 *
 * Auth: Required (Bearer token). The requester ID is extracted from the JWT —
 *       never from the request body — to prevent IDOR attacks.
 *
 * Body (validated with Zod):
 *   { files: [{ fileName: string, mimeType: string, fileSize: number }] }
 *
 * Returns:
 *   { success: true, batchId: string, urls: [{ s3Key, uploadUrl, fileName }] }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as attachmentService from '@/lib/services/session-attachment.service';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const fileSchema = z.object({
  fileName: z.string().min(1, 'El nombre del archivo es requerido').max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({
      message: `Tipo de archivo no permitido. Tipos válidos: PDF, PNG, JPG, DOC, DOCX`,
    }),
  }),
  fileSize: z
    .number()
    .int()
    .positive('El tamaño del archivo debe ser mayor a 0')
    .max(MAX_FILE_SIZE, `El archivo no puede exceder ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

const bodySchema = z.object({
  files: z
    .array(fileSchema)
    .min(1, 'Debes enviar al menos un archivo')
    .max(5, 'Máximo 5 archivos permitidos'),
});

export async function POST(request) {
  // 1. Auth — identity from JWT, never from body
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // 2. Zod validation
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Datos inválidos';
      return NextResponse.json(
        { success: false, error: firstError, details: parsed.error.issues },
        { status: 400 },
      );
    }

    // 3. Generate presigned URLs
    const result = await attachmentService.generateUploadUrls(parsed.data.files);

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      urls: result.urls,
    });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 400 },
      );
    }
    console.error('[POST /api/attachments/presigned-urls]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al generar URLs de subida' },
      { status: 500 },
    );
  }
}
