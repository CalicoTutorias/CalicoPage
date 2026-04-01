/**
 * GET /api/availabilities/me — Get all my availability blocks
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTutor } from '@/lib/auth/guards';
import * as availabilityService from '@/lib/services/availability.service';

export async function GET(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const blocks = await availabilityService.getAvailabilityByUserId(auth.sub);

  return NextResponse.json({ success: true, availabilities: blocks });
}
