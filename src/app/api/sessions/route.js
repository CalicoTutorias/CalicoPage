/**
 * POST /api/sessions — disabled; sessions are created via the payment webhook
 * GET  /api/sessions — Get my sessions (as tutor or student)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';

export async function POST(request) {
  // Sessions can only be created through the payment flow (POST /api/payments/create-intent).
  // Direct creation is disabled to ensure every session has a confirmed payment.
  return NextResponse.json(
    {
      success: false,
      error: 'Las sesiones deben crearse a través del flujo de pago. Usa POST /api/payments/create-intent.',
      code: 'PAYMENT_REQUIRED',
    },
    { status: 403 },
  );
}

const VALID_STATUSES = new Set(['Pending', 'Accepted', 'Rejected', 'Completed', 'Canceled']);

export async function GET(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const role   = searchParams.get('role');
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const includeReviews = searchParams.get('includeReviews') === 'true';

  const rawStatus = searchParams.get('status');
  const status = VALID_STATUSES.has(rawStatus) ? rawStatus : null;

  if (rawStatus && !status) {
    return NextResponse.json(
      { success: false, error: `Invalid status "${rawStatus}". Must be one of: ${[...VALID_STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  let sessions;

  if (role === 'tutor' && auth.isTutorApproved) {
    sessions = status
      ? await sessionService.getSessionsByTutorAndStatus(auth.sub, status, limit)
      : await sessionService.getSessionsByTutor(auth.sub, limit);
  } else {
    sessions = includeReviews
      ? await sessionService.getStudentHistory(auth.sub, limit)
      : await sessionService.getSessionsByStudent(auth.sub, limit);
  }

  return NextResponse.json({ success: true, sessions, count: sessions.length });
}
