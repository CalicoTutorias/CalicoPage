/**
 * Decline Session API Route
 * POST /api/tutoring-sessions/[id]/decline - Decline pending session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions/[id]/decline
 * Body: { tutorId }
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
    
    const session = await tutoringSessionService.declineTutoringSession(id, body.tutorId);
    
    return NextResponse.json({
      success: true,
      message: 'Session declined successfully',
      session,
    });
  } catch (error) {
    console.error(`Error declining session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error declining session',
      },
      { status: 500 }
    );
  }
}

