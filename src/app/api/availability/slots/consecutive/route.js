/**
 * Consecutive Slots API Route
 * POST /api/availability/slots/consecutive - Get consecutive available slots
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import * as slotService from '../../../../lib/services/slot.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/slots/consecutive
 * Body: { tutorId, count, startDate?, endDate? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, count, startDate, endDate } = body;

    if (!tutorId || !count) {
      return NextResponse.json(
        { success: false, error: 'tutorId y count son requeridos' },
        { status: 400 }
      );
    }

    if (count < 1) {
      return NextResponse.json(
        { success: false, error: 'count debe ser al menos 1' },
        { status: 400 }
      );
    }

    // Generate all slots
    const slotsResult = await availabilityService.generateSlots(
      tutorId,
      startDate,
      endDate,
      100
    );

    // Get consecutive groups
    const consecutiveGroups = slotService.getConsecutiveAvailableSlots(slotsResult.slots, count);

    return NextResponse.json({
      success: true,
      consecutiveGroups,
      totalGroups: consecutiveGroups.length,
      slotsPerGroup: count,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/slots/consecutive:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error obteniendo slots consecutivos',
      },
      { status: 500 }
    );
  }
}

