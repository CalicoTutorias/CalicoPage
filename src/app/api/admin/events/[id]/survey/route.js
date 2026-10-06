/**
 * GET /api/admin/events/[id]/survey
 *
 * Survey results: response and attendance rates, event and per-tutor averages, comments.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../_schemas';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const results = await eventAdminService.getSurveyResultsAdmin(id);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]/survey');
  }
}
