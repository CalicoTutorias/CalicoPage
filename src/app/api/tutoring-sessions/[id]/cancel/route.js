/**
 * Cancel Session API Route
 * POST /api/tutoring-sessions/[id]/cancel - Cancel session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions/[id]/cancel
 * Body: { cancelledBy }
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    if (!body.cancelledBy) {
      return NextResponse.json(
        {
          success: false,
          error: 'cancelledBy is required',
        },
        { status: 400 }
      );
    }
    
    await tutoringSessionService.cancelSlotBooking(id, body.cancelledBy);
    
    return NextResponse.json({
      success: true,
      message: 'Session cancelled successfully',
    });
  } catch (error) {
    console.error(`Error cancelling session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error cancelling session',
      },
      { status: 500 }
    );
  }
}

