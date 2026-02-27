/**
 * Cancel Tutoring Session Event API Route
 * POST /api/calico-calendar/tutoring-session/[eventId]/cancel - Cancel event
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '../../../../lib/services/calico-calendar.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/calico-calendar/tutoring-session/[eventId]/cancel
 * Query params: reason (optional)
 */
export async function POST(request, { params }) {
  try {
    const { eventId } = params;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason');

    if (!eventId || !eventId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'eventId is required',
        },
        { status: 400 }
      );
    }

    console.log(`Cancelling tutoring session event: ${eventId}`);

    const result = await calicoCalendarService.cancelTutoringSessionEvent(
      eventId,
      reason || 'Sesión cancelada'
    );

    return NextResponse.json({
      success: true,
      message: 'Evento cancelado exitosamente',
      ...result,
    });
  } catch (error) {
    console.error('Error cancelling tutoring session event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error cancelando evento',
      },
      { status: 500 }
    );
  }
}

