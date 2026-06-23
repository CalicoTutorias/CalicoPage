/**
 * GET /api/sessions/:id — Get session details
 *
 * Auth: Required. Access is restricted to:
 *   - The student who created the session (via SessionParticipant).
 *   - The tutor assigned to the session.
 *   - Admin users (role = 'ADMIN' in the JWT).
 *
 * Role-scoped enrichment:
 *   - Tutor: participants[].student.studentRating (average only, null = "Nuevo";
 *     NO count) + session.studentReviewStatus (content-free [{studentId,status}]).
 *     A tutor never receives rating counts nor comment text — not even their own.
 *   - Admin: full moderation view — studentRating + studentRatingCount +
 *     session.studentReviews (includes comments). Admin-only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';
import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  try {
    const session = await sessionService.getSessionById(id);

    const callerId = String(auth.sub ?? '');
    const isAdmin = auth.role === 'ADMIN';
    const isTutor = session.tutorId === callerId;
    const isStudent = session.participants?.some(
      (p) => String(p.studentId) === callerId,
    );

    if (!isAdmin && !isTutor && !isStudent) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const participantIds = (session.participants ?? [])
      .map((p) => p.studentId)
      .filter(Boolean);

    if (isAdmin) {
      // Admin moderation view: full data, including counts and comment text.
      const [ratingRows, studentReviews] = await Promise.all([
        participantIds.length > 0
          ? prisma.user.findMany({
              where: { id: { in: participantIds } },
              select: { id: true, studentRating: true, studentRatingCount: true },
            })
          : Promise.resolve([]),
        prisma.studentReview.findMany({ where: { sessionId: id } }),
      ]);

      const ratingMap = Object.fromEntries(ratingRows.map((u) => [u.id, u]));

      session.participants = (session.participants ?? []).map((p) => {
        const ratings = ratingMap[p.studentId];
        if (!ratings) return p;
        return {
          ...p,
          student: {
            ...p.student,
            studentRating: ratings.studentRating != null ? Number(ratings.studentRating) : undefined,
            studentRatingCount: ratings.studentRatingCount,
          },
        };
      });

      session.studentReviews = studentReviews;
    } else if (isTutor) {
      // Tutor view: star AVERAGE only (null = "Nuevo"; no count) and a
      // content-free status of THIS tutor's ratings for the session. The comment
      // text is never selected into a tutor-facing query.
      const [ratingRows, statusRows] = await Promise.all([
        participantIds.length > 0
          ? prisma.user.findMany({
              where: { id: { in: participantIds } },
              select: { id: true, studentRating: true, studentRatingCount: true },
            })
          : Promise.resolve([]),
        prisma.studentReview.findMany({
          where: { sessionId: id, tutorId: callerId },
          select: { studentId: true, status: true },
        }),
      ]);

      const ratingMap = Object.fromEntries(ratingRows.map((u) => [u.id, u]));

      session.participants = (session.participants ?? []).map((p) => {
        const ratings = ratingMap[p.studentId];
        if (!ratings) return p;
        return {
          ...p,
          student: {
            ...p.student,
            studentRating:
              ratings.studentRatingCount > 0 && ratings.studentRating != null
                ? Number(ratings.studentRating)
                : null,
          },
        };
      });

      session.studentReviewStatus = statusRows.map((r) => ({ studentId: r.studentId, status: r.status }));
    }

    return NextResponse.json({ success: true, session });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 },
      );
    }
    console.error(`[GET /api/sessions/${id}]`, err.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
