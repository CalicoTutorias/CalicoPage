/**
 * Delete Availability Event API Route
 * DELETE /api/availability/delete - Delete availability event from Google Calendar and Firebase
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * DELETE /api/availability/delete
 * Query params: eventId, calendarId?, accessToken (from body or cookies)
 */
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');
    const calendarId = searchParams.get('calendarId');

    // Try to get accessToken from request body (if provided) or expect it in headers/cookies
    let accessToken = null;
    try {
      const body = await request.json();
      accessToken = body.accessToken;
    } catch {
      // Body might be empty, check headers or cookies
      accessToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    }

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'eventId es requerido' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'accessToken es requerido' },
        { status: 401 }
      );
    }

    await availabilityService.deleteAvailabilityEvent(accessToken, eventId, calendarId);

    return NextResponse.json({
      success: true,
      message: 'Evento de disponibilidad eliminado exitosamente',
    });
  } catch (error) {
    console.error('Error in DELETE /api/availability/delete:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error eliminando evento de disponibilidad',
      },
      { status: 500 }
    );
  }
}

