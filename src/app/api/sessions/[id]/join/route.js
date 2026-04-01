/**
 * POST /api/sessions/:id/join — Student joins a group session
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';

export async function POST(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const participant = await sessionService.joinSession(id, auth.sub);
    return NextResponse.json({ success: true, participant }, { status: 201 });
  } catch (err) {
    const statusMap = {
      NOT_GROUP: 400,
      INVALID_STATUS: 409,
      SELF_BOOKING: 400,
      ALREADY_JOINED: 409,
      SESSION_FULL: 409,
      NOT_FOUND: 404,
    };

    const status = statusMap[err.code];
    if (status) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status });
    }
    throw err;
  }
}
