export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ success: false, error: 'INVALID_SESSION_ID' }, { status: 400 });
  }

  try {
    const payment = await manualSessionService.confirmManualSessionPayment({
      sessionId,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, payment });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'INVALID_INPUT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/manual-sessions/[sessionId]/confirm-payment]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
