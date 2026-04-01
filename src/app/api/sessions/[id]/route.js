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
    const session = await sessionService.getSessionById(id);
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
