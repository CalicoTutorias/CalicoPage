/**
 * Tutor Stats API Route
 * GET /api/tutoring-sessions/tutor/[tutorId]/stats - Get tutor statistics
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/tutor/[tutorId]/stats
 */
export async function GET(request, { params }) {
  const { tutorId } = await params;
  try {
    const stats = await tutoringSessionService.getTutorSessionStats(tutorId);
    
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error(`Error getting stats for tutor ${tutorId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting tutor stats',
      },
      { status: 500 }
    );
  }
}

