/**
 * GET /api/admin/finance/summary?from=ISO&to=ISO
 *
 * Cash per account, what is owed to tutors / students, what is available and
 * the profit of [from, to) (default: this month) and since the cutoff.
 * Projects the missing automatic entries first.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse } from '../_shared';

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).optional().catch(undefined),
  to: z.string().datetime({ offset: true }).optional().catch(undefined),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const { from, to } = querySchema.parse({
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  try {
    const summary = await financeService.getSummary({ from, to });
    return NextResponse.json({ success: true, summary });
  } catch (err) {
    return financeErrorResponse(err, 'GET /api/admin/finance/summary');
  }
}
