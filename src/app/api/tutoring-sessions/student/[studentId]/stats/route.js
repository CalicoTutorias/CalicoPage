/**
 * Student Stats API Route
 * GET /api/tutoring-sessions/student/[studentId]/stats - Get student statistics
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/student/[studentId]/stats
 */
export async function GET(request, { params }) {
  try {
    const { studentId } = params;
    
    const sessions = await tutoringSessionService.getSessionsByStudent(studentId, 1000);
    const stats = tutoringSessionService.getHistoryStats(sessions);
    
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error(`Error getting stats for student ${params.studentId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting student stats',
      },
      { status: 500 }
    );
  }
}

