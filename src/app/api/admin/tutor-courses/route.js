/**
 * GET /api/admin/tutor-courses — List all pending course approval requests
 * Auth: requires an authenticated user with role=ADMIN (checked against the DB).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import { getAllPendingCourseRequests } from '@/lib/services/academic.service';

export async function GET(request) {
  const guard = await requireAdminUser(request);
  if (guard instanceof NextResponse) return guard;

  const requests = await getAllPendingCourseRequests();
  return NextResponse.json({ success: true, requests });
}
