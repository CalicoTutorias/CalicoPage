import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as courseNotifyService from '@/lib/services/course-notify.service';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId');

  if (!courseId) {
    return NextResponse.json(
      { success: false, error: 'courseId query param is required' },
      { status: 400 },
    );
  }

  try {
    const result = await courseNotifyService.getStudentSubscriptionState({
      studentId: auth.sub,
      courseId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[course-notify-subscriptions/me] GET error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

