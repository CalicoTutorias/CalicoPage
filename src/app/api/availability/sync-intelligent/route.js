/**
 * Intelligent Sync API Route
 * POST /api/availability/sync-intelligent - Intelligently sync only new events
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * POST /api/availability/sync-intelligent
 * Body: { tutorId, calendarName?, daysAhead? }
 * Note: accessToken should be in cookies (credentials: 'include')
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tutorId, calendarName = 'Disponibilidad', daysAhead = 30, accessToken } = body;

    if (!tutorId) {
      return NextResponse.json(
        { success: false, error: 'tutorId es requerido' },
        { status: 400 }
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'accessToken es requerido. Usuario no autenticado.' },
        { status: 401 }
      );
    }

    const results = await availabilityService.intelligentSync(
      tutorId,
      accessToken,
      calendarName,
      daysAhead
    );

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error in POST /api/availability/sync-intelligent:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error en sincronización inteligente',
      },
      { status: 500 }
    );
  }
}

