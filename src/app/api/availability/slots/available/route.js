/**
 * Available Slots API Route
 * GET /api/availability/slots/available - Get only available slots (filtered)
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import * as slotService from '../../../../lib/services/slot.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/availability/slots/available
 * Query params: tutorId?, startDate?, endDate?
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tutorId = searchParams.get('tutorId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    const slotsResult = await availabilityService.generateSlots(
      tutorId,
      startDate,
      endDate,
      100
    );

    // Filter to only available slots
    const availableSlots = slotService.getAvailableSlots(slotsResult.slots);

    // Group by date
    const groupedByDate = slotService.groupSlotsByDate(availableSlots);

    return NextResponse.json({
      success: true,
      slots: availableSlots,
      groupedByDate,
      totalSlots: availableSlots.length,
      totalDays: Object.keys(groupedByDate).length,
    });
  } catch (error) {
    console.error('Error in GET /api/availability/slots/available:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error obteniendo slots disponibles',
      },
      { status: 500 }
    );
  }
}

