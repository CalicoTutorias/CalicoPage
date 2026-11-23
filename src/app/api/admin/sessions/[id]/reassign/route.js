/**
 * /api/admin/sessions/:id/reassign — hand a session to another tutor.
 *
 * GET  → { candidates: [{ id, name, email, busy }] } tutors offering the
 *        course (busy = they already have a session overlapping this one).
 * POST { tutorId, reason? } → moves the session and its payments to that
 *        tutor (same session, payment and Meet link), swaps the tutor on the
 *        calendar invite, emails the new tutor and the students and notifies
 *        all of them. Answers { session, calendar, emailsSent, emailsFailed }.
 *
 * Auth: admin user (role read fresh from the DB). Audited.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as detailService from '@/lib/services/admin-session-detail.service';
import { detailErrorResponse, invalidInput, uuidSchema } from '../_shared';

const bodySchema = z.object({
  tutorId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return invalidInput('INVALID_SESSION_ID');

  try {
    const candidates = await detailService.listReassignCandidates(id);
    return NextResponse.json({ success: true, candidates });
  } catch (err) {
    return detailErrorResponse(err, 'GET /api/admin/sessions/[id]/reassign');
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
    const result = await detailService.reassignTutor({
      sessionId: id,
      newTutorId: parsed.data.tutorId,
      reason: parsed.data.reason || null,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return detailErrorResponse(err, 'POST /api/admin/sessions/[id]/reassign');
  }
}
