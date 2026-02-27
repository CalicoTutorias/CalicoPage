/**
 * Tutoring Session Event By ID API Routes
 * GET /api/calico-calendar/tutoring-session/[eventId] - Get event
 * PUT /api/calico-calendar/tutoring-session/[eventId] - Update event
 * DELETE /api/calico-calendar/tutoring-session/[eventId] - Delete event
 */

import { NextResponse } from 'next/server';
import * as calicoCalendarService from '../../../../lib/services/calico-calendar.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/calico-calendar/tutoring-session/[eventId]
 */
export async function GET(request, { params }) {
  try {
    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'eventId is required',
        },
        { status: 400 }
      );
    }

    const result = await calicoCalendarService.getTutoringSessionEvent(eventId);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error getting tutoring session event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error obteniendo evento',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/calico-calendar/tutoring-session/[eventId]
 */
export async function PUT(request, { params }) {
  try {
    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'eventId is required',
        },
        { status: 400 }
      );
    }

    const body = await request.json();

    console.log(`Updating tutoring session event: ${eventId}`);

    // Convert date strings to Date objects if provided
    const updateData = { ...body };
    if (body.startDateTime) {
      updateData.startDateTime = new Date(body.startDateTime);
    }
    if (body.endDateTime) {
      updateData.endDateTime = new Date(body.endDateTime);
    }

    const result = await calicoCalendarService.updateTutoringSessionEvent(eventId, updateData);

    return NextResponse.json({
      success: true,
      message: 'Evento actualizado exitosamente',
      ...result,
    });
  } catch (error) {
    console.error('Error updating tutoring session event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error actualizando evento',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calico-calendar/tutoring-session/[eventId]
 */
export async function DELETE(request, { params }) {
  try {
    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'eventId is required',
        },
        { status: 400 }
      );
    }

    console.log(`Deleting tutoring session event: ${eventId}`);

    const result = await calicoCalendarService.deleteTutoringSessionEvent(eventId);

    return NextResponse.json({
      success: true,
      message: 'Evento eliminado exitosamente',
      ...result,
    });
  } catch (error) {
    console.error('Error deleting tutoring session event:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error eliminando evento',
      },
      { status: 500 }
    );
  }
}

