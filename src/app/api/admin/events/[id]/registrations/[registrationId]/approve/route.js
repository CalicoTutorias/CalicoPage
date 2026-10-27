/**
 * POST /api/admin/events/[id]/registrations/[registrationId]/approve
 *
 * Approve a registration of an approval event: PendingApproval (or Rejected)
 * → Confirmed. Before the event ends the registrant gets the usual
 * confirmation email (meeting link + .ics); `emailSent` says whether it went out.
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
      adminId: auth.sub, eventId: id, registrationId, decision: 'approve', request,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/registrations/[registrationId]/approve');
  }
}
