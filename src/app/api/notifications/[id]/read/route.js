/**
 * PUT /api/notifications/[id]/read
 * Mark a single notification as read (authenticated, owner-only).
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as notificationService from '@/lib/services/notification.service';

export async function PUT(request, { params }) {
  try {
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    const notification = await notificationService.markAsRead(id, auth.sub);
    return NextResponse.json({ success: true, notification });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    console.error('[PUT /api/notifications/:id/read]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
