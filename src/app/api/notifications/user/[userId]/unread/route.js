/**
 * GET /api/notifications/user/[userId]/unread
 * List only unread notifications for a user (authenticated, owner-only).
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

    if (auth.sub !== userIdInt) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const notifications = await notificationService.getUserNotifications(userIdInt, { unreadOnly: true });
    return NextResponse.json({ success: true, notifications });
  } catch (err) {
    console.error('[GET /api/notifications/user/:userId/unread]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
