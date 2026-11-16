/**
 * GET /api/events/past?page= — public history of events that already took
 * place, latest first, each with its results (sign-ups, attendance, rating).
 * No auth; the same for everyone, so the CDN may serve it for 60 s. Comments
 * are only on each event page (GET /api/events/[slug]/results).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicCacheHeaders } from '@/lib/http/cache-headers';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from '../_errors';

const pageSchema = z.coerce.number().int().min(1).max(1000).catch(1);

export async function GET(request) {
  const page = pageSchema.parse(new URL(request.url).searchParams.get('page') ?? undefined);
  try {
    const result = await eventService.listPastEvents({ page });
    return NextResponse.json({ success: true, ...result }, { headers: publicCacheHeaders(60) });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events/past');
  }
}
