/**
 * POST /api/sessions/:id/attachments/upload-urls
 * Issue session-scoped presigned PUT URLs for the session's student creator.
 *
 * Requester identity is taken from the JWT (never from the body).
 *
 * Body: { files: [{ fileName, mimeType, fileSize }] }
 * Returns: { success, urls: [{ s3Key, uploadUrl, fileName }] }
 */

export const dynamic = 'force-dynamic';

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

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const fileSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    errorMap: () => ({
      message: 'Tipo de archivo no permitido. Tipos válidos: PDF, PNG, JPG, DOC, DOCX',
    }),
  }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, `El archivo no puede exceder ${MAX_FILE_SIZE / 1024 / 1024} MB`),
});

const bodySchema = z.object({
  files: z.array(fileSchema).min(1).max(5),
});

function mapErrorStatus(code) {
  if (code === 'VALIDATION_ERROR') return 400;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;
  return 500;
}

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

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

    const result = await attachmentService.generateSessionUploadUrls(
      sessionId,
      auth.sub,
      parsed.data.files,
    );

    return NextResponse.json({ success: true, urls: result.urls });
  } catch (err) {
    const status = mapErrorStatus(err.code);
    if (status === 500) {
      console.error(`[POST /api/sessions/${sessionId}/attachments/upload-urls]:`, err.message);
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Error al generar URLs de subida' },
      { status },
    );
  }
}
