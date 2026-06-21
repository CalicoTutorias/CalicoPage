/**
 * POST /api/sessions/:id/attachments/register
 * Confirm attachments after the client has uploaded them to S3.
 *
 * Requester identity is taken from the JWT. The service:
 *   - Verifies the requester is the session's student creator.
 *   - Rejects s3Keys outside the session's prefix.
 *   - HEADs each object in S3 to confirm it exists and matches declared size/MIME.
 *   - Persists DB rows and flips S3 tag to status=confirmed.
 *
 * Body: { attachments: [{ s3Key, fileName, fileSize, mimeType }] }
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

const attachmentSchema = z.object({
  s3Key: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
});

const bodySchema = z.object({
  attachments: z.array(attachmentSchema).min(1).max(5),
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

    const records = await attachmentService.registerSessionAttachments(
      sessionId,
      auth.sub,
      parsed.data.attachments,
    );

    return NextResponse.json({
      success: true,
      attachments: records.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        uploadedAt: r.uploadedAt,
      })),
    });
  } catch (err) {
    const status = mapErrorStatus(err.code);
    if (status === 500) {
      console.error(`[POST /api/sessions/${sessionId}/attachments/register]:`, err.message);
    }
    return NextResponse.json(
      { success: false, error: err.message || 'Error al registrar archivos' },
      { status },
    );
  }
}
