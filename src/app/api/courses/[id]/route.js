/**
 * Course By ID API Routes
 * GET /api/courses/[id] - Get course by ID (public, read-only)
 *
 * Editing a course goes through PATCH /api/admin/courses (Zod + audit log).
 */

import { NextResponse } from 'next/server';
import { publicCacheHeaders } from '@/lib/http/cache-headers';

const COURSE_CACHE_SECONDS = 60;
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
    
    return NextResponse.json(
      { success: true, course },
      { headers: publicCacheHeaders(COURSE_CACHE_SECONDS) },
    );
  } catch (error) {
    console.error(`Error getting course ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
