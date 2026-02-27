/**
 * Check Event Exists API Route
 * GET /api/availability/check-event - Check if event exists
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/availability/check-event
 * Query params: eventId
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { success: false, error: 'eventId es requerido' },
        { status: 400 }
      );
    }

    const exists = await availabilityService.checkEventExists(eventId);

    return NextResponse.json({
      success: true,
      exists,
    });
  } catch (error) {
    console.error('Error in GET /api/availability/check-event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error verificando evento',
        exists: false,
      },
      { status: 500 }
    );
  }
}

