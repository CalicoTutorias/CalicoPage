import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as courseNotifyService from '@/lib/services/course-notify.service';

const subscribeSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  source: z.enum(['course_card', 'course_detail', 'unknown']).default('unknown'),
});

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const result = await courseNotifyService.subscribeStudentToCourse({
      studentId: auth.sub,
      courseId: parsed.data.courseId,
      source: parsed.data.source,
    });

    return NextResponse.json({ success: true, ...result }, { status: result.state === 'created' ? 201 : 200 });
  } catch (err) {
    if (err.code === 'COURSE_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'COURSE_NOT_FOUND' }, { status: 404 });
    }
    console.error('[course-notify-subscriptions] POST error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

