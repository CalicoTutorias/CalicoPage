/**
 * GET /api/admin/users/:userId/student-reviews — Admin moderation list of the
 * tutor→student reviews RECEIVED by a user, optionally filtered by materia.
 *
 * This is the ONLY read path that exposes the private comment text (tutors can
 * never read it). Guarded by requireAdminUser.
 *
 * The materia filter (`?courseId=`) is resolved through the existing
 * session→course relation — student_reviews has no course column, so the data
 * model stays normalized (no redundant denormalized copy).
 *
 * Query params:
 *   - courseId (optional): restrict to reviews whose session belongs to a materia
 *   - limit (optional, default 50, max 100)
 *
 * Returns: { success, reviews, courses } where `courses` are the distinct
 * materias the student has been reviewed in (for the filter UI).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as studentReviewService from '@/lib/services/student-review.service';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ success: false, error: 'INVALID_USER_ID' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);

  try {
    const [reviews, courses] = await Promise.all([
      studentReviewService.getStudentReviewsReceived(userId, { courseId, limit }),
      studentReviewService.getReviewedCoursesAsStudent(userId),
    ]);

    return NextResponse.json({ success: true, reviews, courses });
  } catch (err) {
    console.error('[GET /api/admin/users/[userId]/student-reviews]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
