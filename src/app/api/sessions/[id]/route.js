/**
 * GET /api/sessions/:id — Get session details
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';

export async function GET(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    let session = await sessionService.getSessionById(id);

    // Tutor-only enrichment: participants' private student rating (estilo
    // Uber) + the reviews this tutor wrote. Students never get these fields.
    if (session.tutorId === auth.sub) {
      session = await sessionService.enrichSessionForTutor(session, auth.sub);
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: 404 },
      );
    }
    throw err;
  }
}
