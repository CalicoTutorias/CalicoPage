export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as courseManagement from '@/lib/services/course-management.service';

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(160),
  notes: z.string().max(800).optional().or(z.literal('')),
});

export async function POST(request) {
  const auth = await authenticateRequest(request);
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
    const suggestion = await courseManagement.createSuggestion({
      requesterId: auth.sub,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, suggestion }, { status: 201 });
  } catch (err) {
    if (err.code === 'COURSE_EXISTS') {
      return NextResponse.json({ success: false, error: 'COURSE_EXISTS' }, { status: 409 });
    }
    console.error('[POST /api/course-suggestions]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
