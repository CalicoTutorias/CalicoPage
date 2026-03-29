/**
 * Tutoring Session By ID API Routes
 * GET /api/tutoring-sessions/[id] - Get session by ID
 * PUT /api/tutoring-sessions/[id] - Update session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/[id]
 */
export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const session = await tutoringSessionService.getSessionById(id);
    
    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error(`Error getting session ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Session not found',
      },
      { status: 404 }
    );
  }
}

/**
 * PUT /api/tutoring-sessions/[id]
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    
    const session = await tutoringSessionService.updateSession(id, body);
    
    return NextResponse.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error(`Error updating session ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error updating session',
      },
      { status: 500 }
    );
  }
}

