/**
 * POST /api/calico-calendar/tutoring-session/:eventId/cancel — Cancel event
 * Query params: reason (optional)
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calicoCalendarService from '@/lib/services/calico-calendar.service';

export async function POST(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { eventId } = await params;
  const { searchParams } = new URL(request.url);
  const reason = searchParams.get('reason') || 'Sesión cancelada';

  const result = await calicoCalendarService.cancelTutoringSessionEvent(eventId, reason);
  return NextResponse.json({ success: true, message: 'Evento cancelado exitosamente', ...result });
}
