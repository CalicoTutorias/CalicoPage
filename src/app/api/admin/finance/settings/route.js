/**
 * GET /api/admin/finance/settings — ledger settings, accounts and categories
 * PUT /api/admin/finance/settings — update them
 *   Body: { cutoffDate?: ISO | null, gmfRate?: number, wompiAccountId?, defaultBankAccountId?, defaultManualAccountId? }
 *   The cutoff date can only change while the ledger is empty (409 CUTOFF_LOCKED).
 *
 * Auth: requireAdminUser. PUT is audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson } from '../_shared';

const bodySchema = z.object({
  cutoffDate: z.union([z.string().datetime({ offset: true }), z.null()]).optional(),
  gmfRate: z.number().min(0).max(0.05).optional(),
  wompiAccountId: z.string().uuid().optional(),
  defaultBankAccountId: z.string().uuid().optional(),
  defaultManualAccountId: z.string().uuid().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nada que actualizar' });

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ success: true, ...(await financeService.getSettings()) });
  } catch (err) {
    return financeErrorResponse(err, 'GET /api/admin/finance/settings');
  }
}

export async function PUT(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const out = await financeService.updateSettings({ adminId: auth.sub, data: parsed.data, request });
    return NextResponse.json({ success: true, ...out });
  } catch (err) {
    return financeErrorResponse(err, 'PUT /api/admin/finance/settings');
  }
}
