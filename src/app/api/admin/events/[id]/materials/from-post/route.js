/**
 * POST /api/admin/events/[id]/materials/from-post
 *
 * Use the PDF of a post (Admin → Posts) as study material of the event. Nothing
 * is uploaded or copied: the material points at the post's own S3 object.
 * Published events only. Body: { postSlug }.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 * Returns: 201 { success, material }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { SLUG_RE } from '@/lib/services/marketing-post.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../../_schemas';

const bodySchema = z.object({ postSlug: z.string().regex(SLUG_RE, 'Identificador de post inválido') });

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
    const material = await eventMaterialService.attachPostDocument({
      adminId: auth.sub, eventId: id, postSlug: parsed.data.postSlug, request,
    });
    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/materials/from-post');
  }
}
