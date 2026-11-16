/**
 * GET /api/admin/course-notify-subscriptions/demand — tablero de
 * reclutamiento: una fila por materia con estudiantes esperando en «Avísame»,
 * con su oferta actual (ver course-notify.service.getRecruitmentDemand).
 * Auth: admin user.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseNotifyService from '@/lib/services/course-notify.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await courseNotifyService.getRecruitmentDemand();
    return NextResponse.json({ success: true, items });
  } catch (err) {
    console.error('[GET /api/admin/course-notify-subscriptions/demand]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
