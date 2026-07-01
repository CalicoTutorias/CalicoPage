import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseNotifyService from '@/lib/services/course-notify.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'all';
  const limit = searchParams.get('limit') || 100;

  try {
    const [subscriptions, metrics] = await Promise.all([
      courseNotifyService.listAdminSubscriptions({ status, limit }),
      courseNotifyService.getAdminMetrics(),
    ]);

    return NextResponse.json({
      success: true,
      subscriptions,
      metrics,
    });
  } catch (err) {
    console.error('[admin/course-notify-subscriptions] GET error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
