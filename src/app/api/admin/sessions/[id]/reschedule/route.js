/**
 * /api/admin/sessions/:id/reschedule — Calico moves a session to a new time.
 *
 * GET  → { siblings: [{ id, startTimestamp, endTimestamp, meetLink }] } other
 *        upcoming sessions of the same tutor and student with a Meet, so the
 *        form can offer sharing one's link when the new time is back to back.
 * POST { startTimestamp, shareMeetWithSessionId? } → moves the session (same
 *        duration, payment, Calendar event) to that start; no time limit on
 *        the old slot (a session that passed without being given can move),
 *        but the new start must be in the future. Google tells the tutor and
 *        the students. Answers { session, calendar: updated|failed|none,
 *        meet: shared|failed|null }.
 *
 * Auth: admin user (role read fresh from the DB). Audited as SESSION_RESCHEDULE.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as detailService from '@/lib/services/admin-session-detail.service';
import { detailErrorResponse, invalidInput, uuidSchema } from '../_shared';

const bodySchema = z.object({
  startTimestamp: z.string().datetime(),
  shareMeetWithSessionId: uuidSchema.optional(),
});

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return invalidInput('INVALID_SESSION_ID');

  try {
    const siblings = await detailService.listRescheduleSiblings(id);
    return NextResponse.json({ success: true, siblings }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return detailErrorResponse(err, 'GET /api/admin/sessions/[id]/reschedule');
  }
}

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return invalidInput('INVALID_SESSION_ID');

  let body;
  try {
    body = await request.json();
  } catch {
    return invalidInput();
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return invalidInput();

  try {
    const result = await detailService.rescheduleSession({
      sessionId: id,
      startTimestamp: new Date(parsed.data.startTimestamp),
      shareMeetWithSessionId: parsed.data.shareMeetWithSessionId || null,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return detailErrorResponse(err, 'POST /api/admin/sessions/[id]/reschedule');
  }
}
