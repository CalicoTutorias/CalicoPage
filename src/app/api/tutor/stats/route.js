/**
 * GET /api/tutor/stats[?courseId=] — figures for the tutor home: sessions
 * scheduled and held, earnings (total and this week), sessions this week and
 * the share of students who came back. With `courseId`, the same figures for
 * that course only (tutor course page). See tutor-dashboard.service.
 *
 * Auth: requireTutor. The tutor is always the one in the JWT.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTutor } from '@/lib/auth/guards';
import * as tutorDashboardService from '@/lib/services/tutor-dashboard.service';

export async function GET(request) {
  const auth = await requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const rawCourseId = new URL(request.url).searchParams.get('courseId');
  const courseId = rawCourseId ? z.string().uuid().safeParse(rawCourseId) : null;
  if (courseId && !courseId.success) {
    return NextResponse.json({ success: false, error: 'Invalid courseId' }, { status: 400 });
  }

  try {
    const stats = await tutorDashboardService.getTutorDashboardStats(auth.sub, {
      courseId: courseId?.data ?? null,
    });
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    console.error('[GET /api/tutor/stats]', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
