/**
 * GET /api/users/me/student-rating — The caller's own aggregate rating as a
 * student (tutor→student reviews, estilo Uber).
 *
 * Returns ONLY the number ({ average, count }) — never the individual reviews
 * or comments, which stay private (tutor who wrote them + admin only).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as studentReviewService from '@/lib/services/student-review.service';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const rating = await studentReviewService.getOwnStudentRating(auth.sub);
  if (!rating) {
    return NextResponse.json(
      { success: false, error: 'Usuario no encontrado' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    average: rating.average,
    count: rating.count,
  });
}
