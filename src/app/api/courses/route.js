/**
 * Courses API Routes
 * GET /api/courses - Get all courses (optionally filtered by tutor)
 * POST /api/courses - Create course
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';

/**
 * GET /api/courses
 * Query params: tutorId (optional)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tutorId = searchParams.get('tutorId');
    
    const courses = tutorId 
      ? await academicService.getCoursesByTutor(tutorId)
      : await academicService.getAllCourses();
    
    return NextResponse.json({
      success: true,
      courses,
      count: courses.length,
    });
  } catch (error) {
    console.error('Error getting courses:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/courses
 * Body: { name, code, credits?, faculty?, prerequisites? }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    
    if (!body.name || !body.code) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name and code are required',
        },
        { status: 400 }
      );
    }
    
    const course = await academicService.createCourse(body);
    
    return NextResponse.json({
      success: true,
      course,
    });
  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

