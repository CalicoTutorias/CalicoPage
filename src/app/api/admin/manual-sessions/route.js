export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';

const bodySchema = z.object({
  tutorId: z.string().uuid(),
  courseId: z.string().uuid(),
  student: z.object({
    name: z.string().trim().min(1).max(120),
    phoneNumber: z.string().trim().min(7).max(30),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  }),
  startTimestamp: z.string().datetime(),
  endTimestamp: z.string().datetime(),
  locationType: z.enum(['Virtual', 'Custom']).optional(),
  notes: z.string().max(1000).optional().or(z.literal('')),
  topicsToReview: z.string().max(1000).optional().or(z.literal('')),
  amount: z.coerce.number().min(0),
  paymentStatus: z.enum(['pending', 'paid']).optional(),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 422 },
    );
  }

  try {
    const result = await manualSessionService.createManualSession({
      ...parsed.data,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    if (err.code === 'INVALID_INPUT' || err.code === 'SESSION_CONFLICT') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[POST /api/admin/manual-sessions]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
