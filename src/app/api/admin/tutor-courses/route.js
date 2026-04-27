/**
 * GET /api/admin/tutor-courses — List all pending course approval requests
 * Header required: x-admin-secret
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guards';
import { getAllPendingCourseRequests } from '@/lib/services/academic.service';

export async function GET(request) {
  const guard = requireAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const requests = await getAllPendingCourseRequests();
  return NextResponse.json({ success: true, requests });
}
