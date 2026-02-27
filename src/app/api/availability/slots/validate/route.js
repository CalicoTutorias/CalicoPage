/**
 * Validate Slot API Route
 * POST /api/availability/slots/validate - Validate a slot for booking
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import * as slotService from '../../../../lib/services/slot.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/slots/validate
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

    // Apply bookings
    const slotsWithBookings = await slotService.applySavedBookingsToSlots([slot]);
    const slotWithBooking = slotsWithBookings[0];

    // Validate
    const validation = slotService.validateSlotForBooking(slotWithBooking);

    return NextResponse.json({
      success: true,
      isValid: validation.isValid,
      errors: validation.errors,
      slot: slotWithBooking,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/slots/validate:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error validando slot',
      },
      { status: 500 }
    );
  }
}

