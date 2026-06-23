/**
 * POST /api/sessions/:id/student-reviews — Tutor publishes a rating+comment for a
 *                                          student of a finished session (write-once)
 * GET  /api/sessions/:id/student-reviews — Content-free status of the calling
 *                                          tutor's pending/done ratings for this session
 *
 * PRIVACY / WRITE-ONLY: tutor→student reviews are never readable by tutors.
 * - POST publishes once and is immutable afterwards (409 on a second attempt).
 *   The response NEVER echoes the stored comment/rating — only `{ status }`.
 * - GET returns ONLY `[{ studentId, status }]` (no rating, no comment), so the
 *   "rate your students" UI knows who is still pending without reading content.
 * - The review TEXT is readable solely by admins via the admin panel
 *   (GET /api/admin/users/:id). Students see only their aggregate via
 *   GET /api/users/me/student-rating.
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
  const auth = await requireTutor(request);
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

    // Write-only: respond with the status only — never the stored comment/rating.
    return NextResponse.json({ success: true, status: result.status }, { status: 201 });
  } catch (err) {
    const statusMap = {
      NOT_FOUND: 404,
      NOT_SESSION_TUTOR: 403,
      INVALID_STUDENT: 400,
      INVALID_RATING: 400,
      SESSION_NOT_ENDED: 422,
      SESSION_NOT_ELIGIBLE: 422,
      ALREADY_REVIEWED: 409,
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
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Content-free: only the caller's own { studentId, status } for this session.
  // No rating, no comment ever crosses this boundary.
  const targets = await studentReviewService.getPendingStudentTargetsForTutor(sessionId, auth.sub);

  return NextResponse.json({ success: true, targets, count: targets.length });
}
