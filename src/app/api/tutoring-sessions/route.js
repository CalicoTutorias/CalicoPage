/**
 * Tutoring Sessions API Routes
 * POST /api/tutoring-sessions - Create session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../lib/services/tutoring-session.service';

/**
 * POST /api/tutoring-sessions
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const session = await tutoringSessionService.createSession(body);
    
    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error creating session',
      },
      { status: 500 }
    );
  }
}

