/**
 * Careers (Majors) API Routes
 * GET /api/majors - Get all careers
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as academicService from '../../../lib/services/academic.service';
import { publicCacheHeaders } from '@/lib/http/cache-headers';

// Tabla de carreras: solo cambia con un seed o una migración.
const MAJORS_CACHE_SECONDS = 3600;

/**
 * GET /api/majors
 * Returns all careers.
 */
export async function GET() {
  try {
    const careers = await academicService.getAllCareers();
    return NextResponse.json(
      {
        success: true,
        majors: careers,
        count: careers.length,
      },
      { headers: publicCacheHeaders(MAJORS_CACHE_SECONDS) },
    );
  } catch (error) {
    console.error('Error getting careers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
