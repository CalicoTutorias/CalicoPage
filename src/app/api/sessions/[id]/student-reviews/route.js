/**
 * POST /api/sessions/:id/student-reviews — Tutor rates a student of a finished session
 * GET  /api/sessions/:id/student-reviews — Reviews the calling tutor wrote for this session
 *
 * PRIVACY: tutor→student reviews are never public. This route only ever
 * returns reviews authored by the authenticated tutor (their own), and only
 * the session's assigned tutor can create one. Students have no read access
 * to individual reviews — they only see their aggregate via
 * GET /api/users/me/student-rating.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as studentReviewService from '@/lib/services/student-review.service';

const createStudentReviewSchema = z.object({
  studentId: z.union([z.string(), z.number()]).transform(String),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;
  const body = await request.json();
  const parsed = createStudentReviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const result = await studentReviewService.createStudentReview(sessionId, auth.sub, parsed.data);

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
      NOT_SESSION_TUTOR: 403,
      INVALID_STUDENT: 400,
      INVALID_RATING: 400,
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

    throw err;
  }
}

export async function GET(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Filtered by the caller's own tutorId — a tutor can only read what they wrote.
  const reviews = await studentReviewService.getSessionStudentReviewsForTutor(sessionId, auth.sub);

  return NextResponse.json({ success: true, reviews, count: reviews.length });
}
