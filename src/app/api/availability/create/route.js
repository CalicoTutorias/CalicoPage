/**
 * Create Availability Event API Route
 * POST /api/availability/create - Create availability event in Google Calendar and Firebase
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/create
 * Body: { tutorId, accessToken, title, date, startTime, endTime, location?, description?, calendarId?, course? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, accessToken, ...eventData } = body;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'accessToken es requerido' },
        { status: 401 }
      );
    }

    const result = await availabilityService.createAvailabilityEvent(
      tutorId,
      accessToken,
      eventData
    );

    return NextResponse.json({
      success: true,
      event: result.event,
      availabilityId: result.availabilityId,
      message: 'Evento de disponibilidad creado exitosamente',
    });
  } catch (error) {
    console.error('Error in POST /api/availability/create:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error creando evento de disponibilidad',
      },
      { status: 500 }
    );
  }
}

