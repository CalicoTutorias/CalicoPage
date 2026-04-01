/**
 * Course By ID API Routes
 * GET /api/courses/[id] - Get course by ID
 * PUT /api/courses/[id] - Update course
 * DELETE /api/courses/[id] - Delete course
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../../lib/services/academic.service';

/**
 * GET /api/courses/[id]
 */
export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const course = await academicService.getCourseById(id);
    
    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      course,
    });
  } catch (error) {
    console.error(`Error getting course ${id}:`, error);
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
 * PUT /api/courses/[id]
 * Body: { name?, code?, credits?, faculty?, prerequisites? }
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    
    const course = await academicService.updateCourse(id, body);
    
    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: 'Course not found',
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      course,
    });
  } catch (error) {
    console.error(`Error updating course ${id}:`, error);
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
 * DELETE /api/courses/[id]
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await academicService.deleteCourse(id);
    
    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting course ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

