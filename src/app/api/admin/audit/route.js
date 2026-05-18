/**
 * GET /api/admin/audit?action=&adminId=&from=&to=&targetType=&limit=&offset=
 * Read-only listing of admin_audit_log with optional filters.
 *
 * Auth: admin user (JWT + role lookup).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as auditService from '@/lib/services/admin-audit.service';

function parseDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit  = Math.max(1, Math.min(parseInt(searchParams.get('limit')  ?? '50', 10) || 50, 200));
  const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0);

  try {
    const { items, total } = await auditService.listEntries({
      action:     searchParams.get('action')     || undefined,
      adminId:    searchParams.get('adminId')    || undefined,
      targetType: searchParams.get('targetType') || undefined,
      targetId:   searchParams.get('targetId')   || undefined,
      from:       parseDate(searchParams.get('from')),
      to:         parseDate(searchParams.get('to')),
      limit,
      offset,
    });
    return NextResponse.json({ success: true, items, total });
  } catch (err) {
    console.error('[GET /api/admin/audit]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
