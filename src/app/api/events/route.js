/**
 * GET /api/events — listed, published, upcoming events (no auth).
 * Same response for everyone, so the CDN may serve it for 30 s.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { publicCacheHeaders } from '@/lib/http/cache-headers';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from './_errors';

export async function GET() {
  try {
    const events = await eventService.listPublicEvents();
    return NextResponse.json({ success: true, events }, { headers: publicCacheHeaders(30) });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events');
  }
}
