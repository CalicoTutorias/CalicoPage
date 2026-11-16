/**
 * GET /api/admin/finance/entries/[id]/proof — short-lived URL of an entry's proof
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, uuidSchema } from '../../../_shared';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
  }
  try {
    const url = await financeService.getEntryProofUrl(id);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return financeErrorResponse(err, 'GET /api/admin/finance/entries/[id]/proof');
  }
}
