/**
 * POST /api/admin/finance/categories — create an expense category
 *   Body: { name }
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson } from '../_shared';

const bodySchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const category = await financeService.saveCategory({ adminId: auth.sub, data: parsed.data, request });
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/categories');
  }
}
