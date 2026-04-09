/**
 * GET /api/notifications/user/[userId]?limit=50
 * List notifications for a user (authenticated, owner-only).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as notificationService from '@/lib/services/notification.service';

export async function GET(request, { params }) {
  try {
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    const { userId } = await params;
    const userIdInt = parseInt(userId, 10);

    // Owner-only: a user can only read their own notifications
    if (auth.sub !== userIdInt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const notifications = await notificationService.getUserNotifications(userIdInt, { limit });
    return NextResponse.json({ success: true, notifications });
  } catch (err) {
    console.error('[GET /api/notifications/user/:userId]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
