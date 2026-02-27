/**
 * Joint Multiple Tutors Availability API Route
 * POST /api/availability/joint/multiple - Get availability for multiple tutors
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/joint/multiple
 * Body: { tutorIds, startDate?, endDate?, limit? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorIds, startDate, endDate, limit = 100 } = body;

    if (!tutorIds || !Array.isArray(tutorIds) || tutorIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'tutorIds es requerido y debe ser un array' },
        { status: 400 }
      );
    }

    const tutorsAvailability = await availabilityService.getMultipleTutorsAvailability(
      tutorIds,
      startDate,
      endDate,
      limit
    );

    const totalTutors = tutorsAvailability.length;
    const connectedTutors = tutorsAvailability.filter(t => t.connected).length;
    const totalSlots = tutorsAvailability.reduce((acc, t) => acc + t.slots.length, 0);

    return NextResponse.json({
      success: true,
      tutorsAvailability,
      totalTutors,
      connectedTutors,
      totalSlots,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/joint/multiple:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error obteniendo disponibilidad conjunta',
      },
      { status: 500 }
    );
  }
}

