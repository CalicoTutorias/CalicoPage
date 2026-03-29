/**
 * Tutor Pending Sessions API Route
 * GET /api/tutoring-sessions/tutor/[tutorId]/pending - Get pending sessions for tutor
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/tutor/[tutorId]/pending
 * Query params: limit (optional)
 */
export async function GET(request, { params }) {
  const { tutorId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 50;
    
    const sessions = await tutoringSessionService.getPendingSessionsForTutor(tutorId, limit);
    
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error(`Error getting pending sessions for tutor ${tutorId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting pending sessions',
      },
      { status: 500 }
    );
  }
}

