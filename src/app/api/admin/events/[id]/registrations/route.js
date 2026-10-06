/**
 * GET /api/admin/events/[id]/registrations
 *
 * Registrants of an event. With ?format=csv returns an attachment instead of JSON.
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
    const registrations = await eventAdminService.listRegistrationsAdmin(id);
    if (new URL(request.url).searchParams.get('format') === 'csv') {
      const { slug } = await eventAdminService.getEventAdmin(id);
      return new Response(eventAdminService.registrationsCsv(registrations), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="inscritos-${slug}.csv"`,
        },
      });
    }
    return NextResponse.json({ success: true, registrations });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]/registrations');
  }
}
