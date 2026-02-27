/**
 * Session Reviews API Routes
 * GET /api/tutoring-sessions/[id]/reviews - Get reviews for session
 * POST /api/tutoring-sessions/[id]/reviews - Add review for session
 */

import { NextResponse } from 'next/server';
import * as tutoringSessionService from '../../../../../lib/services/tutoring-session.service';

/**
 * GET /api/tutoring-sessions/[id]/reviews
 */
export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const result = await tutoringSessionService.getReviews(id);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Error getting reviews for session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error getting reviews',
      },
      { status: error.message === 'Session not found' ? 404 : 500 }
    );
  }
}

/**
 * POST /api/tutoring-sessions/[id]/reviews
 * Body: { reviewerEmail, reviewerName?, stars, comment? }
 */
export async function POST(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    
    const result = await tutoringSessionService.addReview(id, body);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Error adding review for session ${params.id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error adding review',
      },
      { status: error.message === 'Session not found' ? 404 : 500 }
    );
  }
}

