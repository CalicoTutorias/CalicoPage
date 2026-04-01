/**
 * POST /api/calico-calendar/tutoring-session — Create tutoring session event in Calico calendar
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as calicoCalendarService from '@/lib/services/calico-calendar.service';

export async function POST(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();

  const result = await calicoCalendarService.createTutoringSessionEvent({
    summary: body.summary,
    description: body.description,
    startDateTime: new Date(body.startDateTime),
    endDateTime: new Date(body.endDateTime),
    attendees: body.attendees || [],
    location: body.location,
    tutorEmail: body.tutorEmail,
    tutorName: body.tutorName,
    tutorId: body.tutorId,
  });

  return NextResponse.json({
    success: true,
    message: 'Evento de sesión de tutoría creado exitosamente',
    ...result,
  });
}
