/**
 * GET  /api/admin/events/[id]/materials — the event's study material, each
 *      file with a presigned download URL (15 min) for the admin.
 * POST /api/admin/events/[id]/materials — register a file already PUT to S3
 *      with a URL from ./presigned-url. Body: { s3Key, fileName }.
 *
 * Auth: requireAdminUser. POST is audit-logged by the service.
 * Returns: GET { success, materials } · POST 201 { success, material }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../_schemas';

const bodySchema = z.object({
  s3Key: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255),
});

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const materials = await eventMaterialService.listMaterialsAdmin(id);
    return NextResponse.json({ success: true, materials }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]/materials');
  }
}

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
    const material = await eventMaterialService.registerMaterial({ adminId: auth.sub, eventId: id, ...parsed.data, request });
    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/materials');
  }
}
