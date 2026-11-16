/**
 * POST /api/admin/finance/entries/[id]/reverse — cancel an entry with its opposite
 *   Body: { reason }
 * Its 4x1000 and, for a transfer, the other leg are reversed with it.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson, uuidSchema } from '../../../_shared';

const bodySchema = z.object({ reason: z.string().trim().min(1, 'Explica por qué se anula').max(500) });

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const entries = await financeService.reverseEntry({ adminId: auth.sub, id, reason: parsed.data.reason, request });
    return NextResponse.json({ success: true, entries }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/entries/[id]/reverse');
  }
}
