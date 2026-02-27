/**
 * Availability Sync API Route
 * POST /api/availability/sync - Sync availabilities from Google Calendar
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/sync
 * Body: { tutorId, accessToken, calendarId? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, accessToken, calendarId } = body;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'accessToken es requerido' },
        { status: 400 }
      );
    }

    const results = await availabilityService.syncAvailabilities(
      tutorId,
      accessToken,
      calendarId
    );

    return NextResponse.json({
      success: true,
      ...results,
      message: `Sincronización completada: ${results.created} creados, ${results.updated} actualizados`,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/sync:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error sincronizando disponibilidad',
      },
      { status: 500 }
    );
  }
}

