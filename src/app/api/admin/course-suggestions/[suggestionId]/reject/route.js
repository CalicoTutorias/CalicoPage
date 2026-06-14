export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseManagement from '@/lib/services/course-management.service';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { suggestionId } = await params;
  try {
    const suggestion = await courseManagement.rejectSuggestion({
      suggestionId,
      adminId: auth.sub,
      request,
    });
    return NextResponse.json({ success: true, suggestion });
  } catch (err) {
    if (err.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'SUGGESTION_NOT_FOUND' }, { status: 404 });
    }
    console.error('[POST /api/admin/course-suggestions/[suggestionId]/reject]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
