/**
 * Careers (Majors) API Routes
 * GET /api/majors - Get all careers with their department
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';

/**
 * GET /api/majors
 * Returns all careers with their associated department.
 */
export async function GET() {
  try {
    const careers = await academicService.getAllCareers();
    return NextResponse.json({
      success: true,
      majors: careers,
      count: careers.length,
    });
  } catch (error) {
    console.error('Error getting careers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
