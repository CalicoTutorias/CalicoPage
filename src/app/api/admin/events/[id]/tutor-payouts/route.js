/**
 * GET  /api/admin/events/[id]/tutor-payouts  - recorded manual payouts
 * POST /api/admin/events/[id]/tutor-payouts  - record one
 *
 * Body (POST): { tutorId: uuid, amount: int > 0, paidAt: ISO datetime, note?: string <= 300 }
 * Auth: requireAdminUser. POST is audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as eventAdminService from '@/lib/services/event-admin.service';
import { eventErrorResponse, eventIdSchema, invalidBody, invalidEventId } from '../../_schemas';

const payoutSchema = z.object({
  tutorId: z.string().uuid('Tutor inválido'),
  amount: z.number().int('El monto debe ser un entero').positive('El monto debe ser mayor a 0'),
  paidAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(300).nullish(),
});

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!eventIdSchema.safeParse(id).success) return invalidEventId();

  try {
    const payouts = await eventAdminService.listTutorPayouts(id);
    return NextResponse.json({ success: true, payouts });
  } catch (err) {
    return eventErrorResponse(err, 'GET /api/admin/events/[id]/tutor-payouts');
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
  const parsed = payoutSchema.safeParse(rawBody);
  if (!parsed.success) return invalidBody(parsed);

  try {
    const payout = await eventAdminService.createTutorPayout({ adminId: auth.sub, eventId: id, ...parsed.data, request });
    return NextResponse.json({ success: true, payout }, { status: 201 });
  } catch (err) {
    return eventErrorResponse(err, 'POST /api/admin/events/[id]/tutor-payouts');
  }
}
