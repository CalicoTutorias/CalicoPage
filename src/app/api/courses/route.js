/**
 * GET  /api/courses — Get all courses (public, read-only)
 * POST /api/courses — Create course (admin only)
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';
import { requireAdminUser } from '@/lib/auth/guards';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tutorId = searchParams.get('tutorId');

    const courses = tutorId
      ? await academicService.getTutorCourses(tutorId)
      : await academicService.getAllCourses();

    return NextResponse.json({
      success: true,
      courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('[GET /api/courses] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  // Only administrators may create courses
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    if (!body.name || !body.code || !body.careerId) {
      return NextResponse.json(
        { success: false, error: 'Name, code and careerId are required' },
        { status: 400 },
      );
    }

    const course = await academicService.createCourse(body);

    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (error) {
    if (error.code === 'P2003') {
      return NextResponse.json({ success: false, error: 'Invalid careerId' }, { status: 422 });
    }
    console.error('[POST /api/courses] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
