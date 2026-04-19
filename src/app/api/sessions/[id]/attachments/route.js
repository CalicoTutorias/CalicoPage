/**
 * GET /api/sessions/:id/attachments
 * Returns presigned download URLs for a session's attachments.
 *
 * Auth: Required. The requester's identity is extracted from the JWT (auth.sub)
 *       and passed to the service layer which enforces access control:
 *       - Student creator → always allowed.
 *       - Assigned tutor + Pending/Accepted → allowed.
 *       - Any other case → 403 Forbidden.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as attachmentService from '@/lib/services/session-attachment.service';

export async function GET(request, { params }) {
  // 1. Auth — identity from JWT, never from URL/body
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  try {
    // 2. Delegate to service (handles access control internally)
    const result = await attachmentService.getAuthorizedDownloadUrls(sessionId, auth.sub);

    if (!result.authorized) {
      return NextResponse.json(
        { success: false, error: result.reason, code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      attachments: result.attachments,
    });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    console.error(`[GET /api/sessions/${sessionId}/attachments]:`, err.message);
    return NextResponse.json(
      { success: false, error: 'Error al obtener archivos adjuntos' },
      { status: 500 },
    );
  }
}
