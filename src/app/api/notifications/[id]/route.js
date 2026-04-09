/**
 * DELETE /api/notifications/[id]
 * Delete a notification (authenticated, owner-only).
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as notificationService from '@/lib/services/notification.service';

export async function DELETE(request, { params }) {
  try {
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;

    await notificationService.deleteNotification(id, auth.sub);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    console.error('[DELETE /api/notifications/:id]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
