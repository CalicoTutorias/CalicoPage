/**
 * POST /api/admin/events/[id]/materials/link
 *
 * Add an external link (the recording, a Drive folder…) as study material of the
 * event. Nothing goes to S3. Published events only. Body: { name, url }. The
 * service checks the values, so the admin gets a rule the form can explain.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 * Returns: 201 { success, material }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../../_schemas';

const bodySchema = z.object({ name: z.string().max(1000), url: z.string().max(5000) });

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const material = await eventMaterialService.addMaterialLink({
      adminId: auth.sub, eventId: id, name: parsed.data.name, url: parsed.data.url, request,
    });
    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/materials/link');
  }
}
