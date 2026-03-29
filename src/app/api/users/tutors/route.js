/**
 * Tutors API Route
 * GET /api/users/tutors - Get all tutors or filter by course
 */

import { NextResponse } from 'next/server';
import * as userService from '../../../../lib/services/user.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/users/tutors
 * Query params: courseId (preferred) or course — value must match an entry in users.courses (usually Firestore course doc id), limit (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const course = searchParams.get('courseId') || searchParams.get('course');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')) : 100;

    let result;
    if (course) {
      result = await userService.getTutorsByCourse(course, limit);
    } else {
      result = await userService.getAllTutors(limit);
    }
    console.log('result', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in GET /api/users/tutors:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error fetching tutors',
      },
      { status: 500 }
    );
  }
}

