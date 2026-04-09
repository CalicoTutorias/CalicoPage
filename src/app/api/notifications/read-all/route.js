/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as notificationService from '@/lib/services/notification.service';

export async function PUT(request) {
  try {
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    const result = await notificationService.markAllAsRead(auth.sub);
    return NextResponse.json({ success: true, count: result.count });
  } catch (err) {
    console.error('[PUT /api/notifications/read-all]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
