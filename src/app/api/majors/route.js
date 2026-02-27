/**
 * Majors API Routes
 * GET /api/majors - Get all majors
 * POST /api/majors - Create major
 */

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';

/**
 * GET /api/majors
 */
export async function GET(request) {
  try {
    const majors = await academicService.getAllMajors();
    
    return NextResponse.json({
      success: true,
      majors,
      count: majors.length,
    });
  } catch (error) {
    console.error('Error getting majors:', error);
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
 * POST /api/majors
 * Body: { name, code, faculty? }
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
    
    const major = await academicService.createMajor(body);
    
    return NextResponse.json({
      success: true,
      major,
    });
  } catch (error) {
    console.error('Error creating major:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

