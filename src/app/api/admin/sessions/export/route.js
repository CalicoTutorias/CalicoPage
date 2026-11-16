/**
 * GET /api/admin/sessions/export?status=&from=&to=&search=&upcoming=&missingMeet=&includeTest=
 * The operations listing as a CSV attachment, same filters and order as
 * GET /api/admin/sessions, capped at SESSIONS_EXPORT_MAX_ROWS rows. Bogotá
 * local timestamps, Spanish headers, formula injection neutralised.
 *
 * Auth: admin user. Not cached.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminSessionsService from '@/lib/services/admin-sessions.service';
import { utcToBogotaLocalInput } from '@/lib/utils/event-format';
import { readSessionQuery, sessionFiltersSchema } from '../_schemas';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = sessionFiltersSchema.safeParse(readSessionQuery(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid query' },
      { status: 400 },
    );
  }

  try {
    const now = new Date();
    const csv = await adminSessionsService.sessionsCsv(parsed.data, now);
    const day = utcToBogotaLocalInput(now).slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="tutorias-${day}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[GET /api/admin/sessions/export]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
