/**
 * POST /api/attachments/presigned-urls
 * Generate presigned S3 PUT URLs for uploading session attachments.
 *
 * Auth: Required (Bearer token). The requester ID is extracted from the JWT —
 *       never from the request body — to prevent IDOR attacks.
 *
 * Body (validated with Zod):
 *   { subject: string, files: [{ fileName: string, mimeType: string, fileSize: number }] }
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
  // z.enum errorMap is unreliable in Zod 3.22+; .refine() is stable across versions
  mimeType: z.string().refine(
    (val) => ALLOWED_MIME_TYPES.includes(val),
    { message: 'Tipo de archivo no permitido. Tipos válidos: PDF, PNG, JPG, DOC, DOCX' },
  ),
  fileSize: z
    .number()
    .int()
    .positive('El tamaño del archivo debe ser mayor a 0')
    .max(MAX_FILE_SIZE, `El archivo no puede exceder ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

const bodySchema = z.object({
  subject: z
    .string()
    .min(1, 'La materia es requerida')
    .max(120, 'La materia no puede exceder 120 caracteres'),
  files: z
    .array(fileSchema)
    .min(1, 'Debes enviar al menos un archivo')
    .max(5, 'Máximo 5 archivos permitidos'),
});

export async function POST(request) {
  // 1. Auth — identity from JWT, never from body
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // 2. Zod validation
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Zod 3.22+ emits a generic invalid_type message for missing string fields
      // regardless of required_error/invalid_type_error options; override here.
      let message = issue?.message || 'Datos inválidos';
      if (issue?.code === 'invalid_type' && issue?.path[0] === 'subject') {
        message = 'La materia es requerida';
      }
      return NextResponse.json(
        { success: false, error: message, details: parsed.error.issues },
        { status: 400 },
      );
    }

    // 3. Generate presigned URLs
    const result = await attachmentService.generateUploadUrls(parsed.data.files, {
      subject: parsed.data.subject,
    });

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
