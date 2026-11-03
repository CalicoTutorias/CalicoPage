/**
 * POST /api/notifications
 * Create a notification (admin only — no browser flow creates notifications;
 * server code uses the repository directly).
 */

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as notificationRepo from '@/lib/repositories/notification.repository';

export async function POST(request) {
  try {
    const auth = await requireAdminUser(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { userId, type, message, sessionId, metadata } = body;

    if (!userId || !type || !message) {
      return NextResponse.json(
        { error: 'userId, type, and message are required' },
        { status: 400 },
      );
    }

    const notification = await notificationRepo.create({
      userId,
      type,
      message,
      sessionId: sessionId || null,
      metadata: metadata || null,
    });

    return NextResponse.json({ success: true, notification }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/notifications]', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
