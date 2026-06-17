export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseManagement from '@/lib/services/course-management.service';

const bodySchema = z.object({
  code: z.string().trim().min(2).max(20).optional(),
  name: z.string().trim().min(3).max(160).optional(),
  complexity: z.enum(['Introductory', 'Foundational', 'Challenging']).optional(),
  basePrice: z.coerce.number().min(0).optional(),
});

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { suggestionId } = await params;
  let body = {};
  try { body = await request.json(); } catch { /* allow empty body */ }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 422 });
  }

  try {
    const suggestion = await courseManagement.approveSuggestion({
      suggestionId,
      adminId: auth.sub,
      courseData: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, suggestion });
  } catch (err) {
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    if (err.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'COURSE_EXISTS' }, { status: 409 });
    }
    console.error('[POST /api/admin/course-suggestions/[suggestionId]/approve]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
