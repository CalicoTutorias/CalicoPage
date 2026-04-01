/**
 * GET    /api/calico-calendar/tutoring-session/:eventId — Get event
 * PUT    /api/calico-calendar/tutoring-session/:eventId — Update event
 * DELETE /api/calico-calendar/tutoring-session/:eventId — Delete event
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calicoCalendarService from '@/lib/services/calico-calendar.service';

export async function GET(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { eventId } = await params;

  const result = await calicoCalendarService.getTutoringSessionEvent(eventId);
  return NextResponse.json({ success: true, ...result });
}

export async function PUT(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { eventId } = await params;
  const body = await request.json();

  const updateData = { ...body };
  if (body.startDateTime) updateData.startDateTime = new Date(body.startDateTime);
  if (body.endDateTime) updateData.endDateTime = new Date(body.endDateTime);

  const result = await calicoCalendarService.updateTutoringSessionEvent(eventId, updateData);
  return NextResponse.json({ success: true, message: 'Evento actualizado exitosamente', ...result });
}

export async function DELETE(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { eventId } = await params;

  const result = await calicoCalendarService.deleteTutoringSessionEvent(eventId);
  return NextResponse.json({ success: true, message: 'Evento eliminado exitosamente', ...result });
}
