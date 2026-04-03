/**
 * POST /api/sessions — Create a new tutoring session (student booking)
 * GET  /api/sessions — Get my sessions (as tutor or student)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as sessionService from '@/lib/services/session.service';

const createSessionSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  tutorId: z.string().uuid('Invalid tutor ID'),
  sessionType: z.enum(['Individual', 'Group']).optional().default('Individual'),
  maxCapacity: z.number().int().min(2).max(20).optional(),
  startTimestamp: z.string().datetime({ message: 'startTimestamp must be ISO 8601' }),
  endTimestamp: z.string().datetime({ message: 'endTimestamp must be ISO 8601' }),
  locationType: z.enum(['Virtual', 'Custom']).optional().default('Virtual'),
  notes: z.string().max(500).optional(),
});

export async function POST(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = createSessionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const session = await sessionService.createSession(auth.sub, parsed.data);
    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (err) {
    const statusMap = {
      SELF_BOOKING: 400,
      TUTOR_NOT_APPROVED: 404,
      INVALID_TIMES: 400,
      OUTSIDE_AVAILABILITY: 409,
      SESSION_CONFLICT: 409,
      MAX_SESSIONS_REACHED: 409,
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

export async function GET(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role'); // 'tutor' or 'student'
  const status = searchParams.get('status'); // optional filter
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const includeReviews = searchParams.get('includeReviews') === 'true'; // Include reviews in response

  let sessions;

  if (role === 'tutor' && auth.isTutorApproved) {
    sessions = status
      ? await sessionService.getSessionsByTutorAndStatus(auth.sub, status, limit)
      : await sessionService.getSessionsByTutor(auth.sub, limit);
  } else {
    // For student, optionally include reviews
    sessions = includeReviews
      ? await sessionService.getStudentHistory(auth.sub, limit)
      : await sessionService.getSessionsByStudent(auth.sub, limit);
  }

  return NextResponse.json({ success: true, sessions, count: sessions.length });
}
