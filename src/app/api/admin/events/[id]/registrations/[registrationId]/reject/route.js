/**
 * POST /api/admin/events/[id]/registrations/[registrationId]/reject
 *
 * Reject a registration of an approval event: PendingApproval (or Confirmed)
 * → Rejected. No email: the team tells the student directly.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 * Returns: { success: true, registration, emailSent }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidEventId } from '../../../../_schemas';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id, registrationId } = await params;
  if (!eventIdSchema.safeParse(id).success || !eventIdSchema.safeParse(registrationId).success) return invalidEventId();

  try {
    const result = await eventAdminService.reviewRegistration({
      adminId: auth.sub, eventId: id, registrationId, decision: 'reject', request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/registrations/[registrationId]/reject');
  }
}
