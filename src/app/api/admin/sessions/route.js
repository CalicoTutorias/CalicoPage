/**
 * GET /api/admin/sessions?status=&from=&to=&search=&upcoming=&missingMeet=&includeTest=&limit=&offset=
 * Operations listing behind /home/admin/tutorias: every session, latest
 * start first (soonest first with upcoming=true), with course, tutor and
 * students (name + email), status, source, payment, Meet link and
 * cancellation details. Filters: see ./_schemas.js. limit 1–100 (25).
 *
 * Auth: admin user. Not cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminSessionsService from '@/lib/services/admin-sessions.service';
import { readSessionQuery, sessionListSchema } from './_schemas';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = sessionListSchema.safeParse(readSessionQuery(searchParams, ['limit', 'offset']));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid query' },
      { status: 400 },
    );
  }

  try {
    const page = await adminSessionsService.listSessions(parsed.data);
    return NextResponse.json({ success: true, ...page });
  } catch (err) {
    console.error('[GET /api/admin/sessions]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
