/**
 * GET /api/sessions/:id — Get session details
 *
 * Auth: Required. Access is restricted to:
 *   - The student who created the session (via SessionParticipant).
 *   - The tutor assigned to the session.
 *   - Admin users (role = 'ADMIN' in the JWT).
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
    const session = await sessionService.getSessionById(id);

    // Verify the caller is a participant, the assigned tutor, or an admin
    const callerId = String(auth.sub ?? '');
    const isAdmin = auth.role === 'ADMIN';
    const isTutor = session.tutorId === callerId;
    const isStudent = session.participants?.some(
      (p) => String(p.studentId) === callerId,
    );

    if (!isAdmin && !isTutor && !isStudent) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 },
      );
    }
    console.error(`[GET /api/sessions/${id}]`, err.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
