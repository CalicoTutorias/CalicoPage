/**
 * PUT /api/sessions/:id/complete — Tutor marks a session as completed
 */

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as sessionService from '@/lib/services/session.service';

export async function PUT(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const session = await sessionService.completeSession(id, auth.sub);
    return NextResponse.json({ success: true, session });
  } catch (err) {
    const statusMap = { FORBIDDEN: 403, INVALID_STATUS: 409, NOT_FOUND: 404 };
    const status = statusMap[err.code];
    if (status) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
