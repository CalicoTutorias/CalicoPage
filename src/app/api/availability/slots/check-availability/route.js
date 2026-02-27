/**
 * Check Slot Availability API Route
 * POST /api/availability/slots/check-availability - Check slot availability in real time
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import * as slotService from '../../../../lib/services/slot.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/slots/check-availability
 * Body: { tutorId, parentAvailabilityId, slotIndex }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, parentAvailabilityId, slotIndex } = body;

    if (!tutorId || !parentAvailabilityId || slotIndex === undefined) {
      return NextResponse.json(
        { success: false, error: 'tutorId, parentAvailabilityId y slotIndex son requeridos' },
        { status: 400 }
      );
    }

    // Get the availability
    const availability = await availabilityService.getAvailabilityById(parentAvailabilityId);

    if (!availability) {
      return NextResponse.json(
        { success: false, error: 'Disponibilidad no encontrada' },
        { status: 404 }
      );
    }

    // Generate slot
    const slots = slotService.generateHourlySlots(availability);
    const slot = slots.find(s => s.slotIndex === slotIndex);

    if (!slot) {
      return NextResponse.json(
        { success: false, error: 'Slot no encontrado' },
        { status: 404 }
      );
    }

    // Check availability in real time
    const availabilityCheck = await slotService.checkSlotAvailabilityRealTime(slot);

    return NextResponse.json({
      success: true,
      ...availabilityCheck,
      slot,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/slots/check-availability:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error verificando disponibilidad del slot',
      },
      { status: 500 }
    );
  }
}

