/**
 * POST /api/admin/finance/accounts — create a money account
 *   Body: { name, type: 'WOMPI'|'BANK'|'CASH', gmfApplies?: boolean }
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { accountFields, financeErrorResponse, invalidBody, readJson } from '../_shared';

const bodySchema = z.object({
  name: accountFields.name,
  type: accountFields.type,
  gmfApplies: accountFields.gmfApplies.optional().default(false),
});

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const account = await financeService.saveAccount({ adminId: auth.sub, data: parsed.data, request });
    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/accounts');
  }
}
