/**
 * Course By ID API Routes
 * GET /api/courses/[id] - Get course by ID
 * PUT /api/courses/[id] - Update course
 * DELETE /api/courses/[id] - Delete course
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';

/**
 * GET /api/courses/[id]
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
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
    console.error(`Error getting course ${params.id}:`, error);
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
  try {
    const { id } = params;
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
    console.error(`Error updating course ${params.id}:`, error);
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
  try {
    const { id } = params;
    await academicService.deleteCourse(id);
    
    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting course ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

