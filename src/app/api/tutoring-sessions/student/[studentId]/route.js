/**
 * Student Sessions API Route
 * GET /api/tutoring-sessions/student/[studentId] - Get sessions for student
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/student/[studentId]
 * Query params: limit (optional)
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { studentId } = resolvedParams;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 50;
    
    const sessions = await tutoringSessionService.getSessionsByStudent(studentId, limit);
    
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    const resolvedParams = await params;
    console.error(`Error getting sessions for student ${resolvedParams.studentId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting student sessions',
      },
      { status: 500 }
    );
  }
}

