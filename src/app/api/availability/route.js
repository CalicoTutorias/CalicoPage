/**
 * Availability API Route
 * GET /api/availability - Get availabilities with filters
 */

import { NextResponse } from 'next/server';
import * as availabilityService from '../../../../lib/services/availability.service';
import { initializeFirebaseAdmin } from '../../../../lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

/**
 * GET /api/availability
 * Query params: tutorId, course, startDate, endDate, limit
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const query = {
      tutorId: searchParams.get('tutorId'),
      course: searchParams.get('course'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')) : 50,
    };

    // Remove null values
    Object.keys(query).forEach(key => {
      if (query[key] === null) delete query[key];
    });

    const availabilities = await availabilityService.getAvailabilities(query);

    return NextResponse.json({
      success: true,
      availabilities,
      count: availabilities.length,
    });
  } catch (error) {
    console.error('Error in GET /api/availability:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error fetching availabilities',
      },
      { status: 500 }
    );
  }
}

