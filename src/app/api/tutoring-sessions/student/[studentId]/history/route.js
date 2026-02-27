/**
 * Student History API Route
 * GET /api/tutoring-sessions/student/[studentId]/history - Get student tutoring history
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/student/[studentId]/history
 * Query params: startDate, endDate, course, limit (all optional)
 */
export async function GET(request, { params }) {
  try {
    const { studentId } = params;
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const course = searchParams.get('course');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit'), 10) : 100;
    
    let sessions = await tutoringSessionService.getStudentTutoringHistory(studentId, limit);
    
    // Apply filters
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;
      sessions = tutoringSessionService.filterByDate(sessions, start, end);
    }
    
    if (course) {
      sessions = tutoringSessionService.filterByCourse(sessions, course);
    }
    
    // Get statistics
    const stats = tutoringSessionService.getHistoryStats(sessions);
    const uniqueCourses = tutoringSessionService.getUniqueCourses(sessions);
    
    return NextResponse.json({
      success: true,
      sessions,
      count: sessions.length,
      stats,
      uniqueCourses,
    });
  } catch (error) {
    console.error(`Error getting history for student ${params.studentId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting student history',
      },
      { status: 500 }
    );
  }
}

