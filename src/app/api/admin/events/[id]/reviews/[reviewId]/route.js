/**
 * DELETE /api/admin/events/[id]/reviews/[reviewId]
 *
 * Remove one review of this event from the tutor's public profile and rating.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../../_schemas';

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id, reviewId } = await params;
  if (!eventIdSchema.safeParse(id).success || !eventIdSchema.safeParse(reviewId).success) return invalidEventId();

  try {
    await eventAdminService.deleteEventReview({ adminId: auth.sub, eventId: id, reviewId, request });
    return NextResponse.json({ success: true });
  } catch (err) {
    return eventErrorResponse(err, 'DELETE /api/admin/events/[id]/reviews/[reviewId]');
  }
}
