/**
 * Generate Slots API Route
 * POST /api/availability/slots/generate - Generate hourly slots from availabilities
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/slots/generate
 * Body: { tutorId, startDate?, endDate?, limit? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, startDate, endDate, limit } = body;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    const result = await availabilityService.generateSlots(
      tutorId,
      startDate,
      endDate,
      limit
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /api/availability/slots/generate:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error generando slots',
      },
      { status: 500 }
    );
  }
}

