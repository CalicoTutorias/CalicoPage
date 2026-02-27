/**
 * Complete Session API Route
 * POST /api/tutoring-sessions/[id]/complete - Mark session as completed
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions/[id]/complete
 * Body: { rating?, comment? }
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    const session = await tutoringSessionService.completeSession(
      id,
      body.rating,
      body.comment
    );
    
    return NextResponse.json({
      success: true,
      message: 'Session completed successfully',
      session,
    });
  } catch (error) {
    console.error(`Error completing session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error completing session',
      },
      { status: 500 }
    );
  }
}

