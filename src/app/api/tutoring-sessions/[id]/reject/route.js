/**
 * Reject Session API Route
 * POST /api/tutoring-sessions/[id]/reject - Reject pending session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions/[id]/reject
 * Body: { tutorId, reason? }
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    if (!body.tutorId) {
      return NextResponse.json(
        {
          success: false,
          error: 'tutorId is required',
        },
        { status: 400 }
      );
    }
    
    const session = await tutoringSessionService.rejectTutoringSession(
      id,
      body.tutorId,
      body.reason || ''
    );
    
    return NextResponse.json({
      success: true,
      message: 'Session rejected successfully',
      session,
    });
  } catch (error) {
    console.error(`Error rejecting session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error rejecting session',
      },
      { status: 500 }
    );
  }
}

