/**
 * GET /api/events/[slug]/results?page= — once the event is over: its results
 * (sign-ups, attendance, survey rating) and one page of the public comments
 * left on its tutors. No auth, the same for everyone: cached 60 s.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publicCacheHeaders } from '@/lib/http/cache-headers';
import * as eventService from '@/lib/services/event.service';
import { eventsErrorResponse } from '../../_errors';

const pageSchema = z.coerce.number().int().min(1).max(1000).catch(1);

export async function GET(request, { params }) {
  const { slug } = await params;
  const page = pageSchema.parse(new URL(request.url).searchParams.get('page') ?? undefined);
  try {
    const result = await eventService.getEventResults({ slug, page });
    return NextResponse.json({ success: true, ...result }, { headers: publicCacheHeaders(60) });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events/[slug]/results');
  }
}
