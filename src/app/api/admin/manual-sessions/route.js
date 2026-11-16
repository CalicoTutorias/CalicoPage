/**
 * GET  /api/admin/manual-sessions?limit=&offset=  One page of manual sessions.
 * POST /api/admin/manual-sessions                 Register one. The slot must be
 *   in the tutor's availability and the price comes from the course: any amount
 *   or payment status in the body is ignored. The payment starts `pending`.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { MANUAL_SESSION_DURATIONS } from '@/lib/availability/manual-session-slots';
import { emailSchema, invalidInput, manualSessionErrorResponse, readJson } from './_shared';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).catch(20),
  offset: z.coerce.number().int().min(0).catch(0),
});

const bodySchema = z.object({
  tutorId: z.string().uuid(),
  courseId: z.string().uuid(),
  // Phone and tag are optional here: only the service knows whether the email
  // already has an account, and it answers with its own codes when they are needed.
  student: z.object({
    phoneNumber: z.string().trim().max(30).optional(),
    whatsappTag: z.string().trim().max(60).optional(),
    email: emailSchema,
  }),
  startTimestamp: z.string().datetime(),
  durationMinutes: z.number().int().refine((minutes) => MANUAL_SESSION_DURATIONS.includes(minutes)),
  notes: z.string().trim().max(1000).optional(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const { limit, offset } = querySchema.parse({
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });

  try {
    const result = await manualSessionService.listManualSessions({ limit, offset });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions');
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput();

  try {
    const result = await manualSessionService.createManualSession({
      ...parsed.data,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    return manualSessionErrorResponse(err, 'POST /api/admin/manual-sessions');
  }
}
