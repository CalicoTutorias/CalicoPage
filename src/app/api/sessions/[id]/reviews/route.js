/**
 * POST /api/sessions/:id/reviews — Create a review for a completed session
 * GET  /api/sessions/:id/reviews — Get all reviews for a session
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as reviewService from '@/lib/services/review.service';

const createReviewSchema = z.object({
  tutorId: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;
  const body = await request.json();
  const parsed = createReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const result = await reviewService.createReview(sessionId, auth.sub, parsed.data);

    return NextResponse.json(
      {
        success: true,
        review: result.review,
        updated: result.updated,
      },
      { status: result.updated ? 200 : 201 },
    );
  } catch (err) {
    const statusMap = {
      NOT_FOUND: 404,
      NOT_PARTICIPANT: 403,
      INVALID_TUTOR: 400,
      INVALID_RATING: 400,
      REVIEW_ALREADY_COMPLETED: 409,
      SESSION_NOT_ENDED: 422,
      SESSION_NOT_ELIGIBLE: 422,
    };

    const status = statusMap[err.code];
    if (status) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status },
      );
    }

    // Prisma unique constraint violation (shouldn't happen with new upsert logic)
    if (err.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Ya has calificado a este usuario por esta sesión', code: 'DUPLICATE_REVIEW' },
        { status: 409 },
      );
    }

    throw err;
  }
}

export async function GET(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const reviews = await reviewService.getSessionReviews(sessionId);

  return NextResponse.json({ success: true, reviews, count: reviews.length });
}
