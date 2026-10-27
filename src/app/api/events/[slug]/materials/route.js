/**
 * GET /api/events/[slug]/materials — the event's study material for the caller.
 *
 * Only for a Confirmed registrant who already answered the survey; anyone
 * else gets 403 MATERIALS_LOCKED. No URLs here: each download asks
 * ./[materialId]/download for a short-lived one.
 *
 * Auth: authenticateRequest; the user is always auth.sub.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventsErrorResponse } from '../../_errors';

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  try {
    const materials = await eventMaterialService.listMaterialsForStudent({ slug, userId: auth.sub });
    return NextResponse.json({ success: true, materials }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events/[slug]/materials');
  }
}
