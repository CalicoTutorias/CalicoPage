/**
 * /api/admin/events
 *
 * GET  — list events with their registration stats.
 *        Query: ?filter=all|draft|published|finished|canceled
 * POST — create a Draft event. The creator is always the authenticated admin
 *        (auth.sub), never a body field.
 *
 * Auth: requireAdminUser (DB-fresh role check + rate limit) on both verbs.
 * Every mutation is recorded in the admin audit log by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { createEventSchema, eventErrorResponse, invalidBody } from './_schemas';

const listQuerySchema = z.object({
  filter: z.enum(['all', 'draft', 'published', 'finished', 'canceled']).default('all'),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({ filter: searchParams.get('filter') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 });
  }

  try {
    const events = await eventAdminService.listEventsAdmin(parsed.data);
    return NextResponse.json({ success: true, events });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events');
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = createEventSchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const event = await eventAdminService.createEvent({
      adminId: auth.sub,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events');
  }
}
