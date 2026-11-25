/**
 * POST /api/admin/sessions/:id/cancel — Calico cancels a session.
 *
 * Body { reason } (5–500 chars, shown to the tutor and the students). Only
 * Pending/Accepted sessions whose tutor has not been paid yet; no 6-hour limit.
 * Deletes the Calendar event, emails and notifies the tutor and the students.
 * A paid session goes to Finanzas → Devoluciones and the student picks the
 * refund method from their history. Answers
 * { session, calendar: deleted|failed|none, emailsSent, emailsFailed, refundPending }.
 *
 * Auth: admin user (role read fresh from the DB). Audited as SESSION_CANCEL.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as detailService from '@/lib/services/admin-session-detail.service';
import { detailErrorResponse, invalidInput, uuidSchema } from '../_shared';

const bodySchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

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
  if (!parsed.success) return invalidInput('INVALID_REASON');

  try {
    const result = await detailService.cancelSession({
      sessionId: id,
      reason: parsed.data.reason,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return detailErrorResponse(err, 'POST /api/admin/sessions/[id]/cancel');
  }
}
