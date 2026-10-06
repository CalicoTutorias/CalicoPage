/**
 * POST /api/admin/events/[id]/cancel
 *
 * Cancel a Published event: every registration is cancelled and every
 * payment queued for refund; registrants are emailed after the commit.
 *
 * Body (optional): { reason?: string ≤ 300 }
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../_schemas';

const cancelSchema = z.object({
  reason: z.string().trim().max(300).nullish(),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  let rawBody = {};
  const text = await request.text();
  if (text) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
  }

  const parsed = cancelSchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const event = await eventAdminService.cancelEvent({
      adminId: auth.sub,
      id,
      reason: parsed.data.reason,
      request,
    });
    return NextResponse.json({ success: true, event });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/cancel');
  }
}
