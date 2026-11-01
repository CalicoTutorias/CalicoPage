/**
 * POST /api/events/[slug]/attendance — join a free event that already took
 * place through its private attendance link. Confirms the caller's
 * registration, which opens the survey and, after it, the material.
 *
 * Body: { code: string }
 * Auth: authenticateRequest; the user is always auth.sub. 10 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventCheckoutService from '@/lib/services/event-checkout.service';
import { eventsErrorResponse, invalidBody, readJsonBody } from '../../_errors';

const attendanceSchema = z.object({ code: z.string().trim().min(1).max(64) });

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`attendance:${auth.sub}`, { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { slug } = await params;
  const parsed = attendanceSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return invalidBody();

  try {
    await eventCheckoutService.claimAttendance({ slug, userId: auth.sub, code: parsed.data.code });
    return NextResponse.json({ success: true });
  } catch (err) {
    return eventsErrorResponse(err, 'POST /api/events/[slug]/attendance');
  }
}
