/**
 * Create Tutoring Session Event API Route
 * POST /api/calico-calendar/tutoring-session - Create tutoring session event
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '../../../../lib/services/calico-calendar.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/calico-calendar/tutoring-session
 * Body: { summary, description?, startDateTime, endDateTime, attendees?, location?, tutorEmail, tutorName?, tutorId }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    console.log(`Creating tutoring session event: ${body.summary}`);

    // Convert date strings to Date objects
    const startDateTime = new Date(body.startDateTime);
    const endDateTime = new Date(body.endDateTime);

    const result = await calicoCalendarService.createTutoringSessionEvent({
      summary: body.summary,
      description: body.description,
      startDateTime,
      endDateTime,
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
  } catch (error) {
    console.error('Error creating tutoring session event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error creando evento de sesión de tutoría',
      },
      { status: 500 }
    );
  }
}

