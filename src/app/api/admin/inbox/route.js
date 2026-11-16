/**
 * GET /api/admin/inbox — colas de «Requiere acción» del Inicio de admin.
 * Auth: admin user. Sin caché (los contadores deben bajar al actuar).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as adminInboxService from '@/lib/services/admin-inbox.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const inbox = await adminInboxService.getInbox();
    return NextResponse.json({ success: true, ...inbox });
  } catch (err) {
    console.error('[GET /api/admin/inbox]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
