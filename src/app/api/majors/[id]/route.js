/**
 * Major By ID API Routes
 * GET /api/majors/[id] - Get major by ID
 * PUT /api/majors/[id] - Update major
 * DELETE /api/majors/[id] - Delete major
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../../lib/services/academic.service';

/**
 * GET /api/majors/[id]
 */
export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const major = await academicService.getMajorById(id);
    
    if (!major) {
      return NextResponse.json(
        {
          success: false,
          error: 'Major not found',
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      major,
    });
  } catch (error) {
    console.error(`Error getting major ${id}:`, error);
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
 * PUT /api/majors/[id]
 * Body: { name?, code?, faculty? }
 */
export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    
    const major = await academicService.updateMajor(id, body);
    
    if (!major) {
      return NextResponse.json(
        {
          success: false,
          error: 'Major not found',
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      major,
    });
  } catch (error) {
    console.error(`Error updating major ${id}:`, error);
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
 * DELETE /api/majors/[id]
 */
export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    await academicService.deleteMajor(id);
    
    return NextResponse.json({
      success: true,
      message: 'Major deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting major ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

