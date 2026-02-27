/**
 * Student Courses API Route
 * GET /api/tutoring-sessions/student/[studentId]/courses - Get unique courses from student history
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/student/[studentId]/courses
 */
export async function GET(request, { params }) {
  try {
    const { studentId } = params;
    
    const sessions = await tutoringSessionService.getSessionsByStudent(studentId, 1000);
    const courses = tutoringSessionService.getUniqueCourses(sessions);
    
    return NextResponse.json({
      success: true,
      courses,
      count: courses.length,
    });
  } catch (error) {
    console.error(`Error getting courses for student ${params.studentId}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting student courses',
      },
      { status: 500 }
    );
  }
}

