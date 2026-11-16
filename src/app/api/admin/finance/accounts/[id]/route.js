/**
 * PATCH /api/admin/finance/accounts/[id] — rename, change the 4x1000 flag or (de)activate
 *   Body: { name?, type?, gmfApplies?, isActive? }
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { accountFields, financeErrorResponse, invalidBody, readJson, uuidSchema } from '../../_shared';

const bodySchema = z
  .object(Object.fromEntries(Object.entries(accountFields).map(([k, s]) => [k, s.optional()])))
  .refine((d) => Object.keys(d).length > 0, { message: 'Nada que actualizar' });

export async function PATCH(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const account = await financeService.saveAccount({ adminId: auth.sub, id, data: parsed.data, request });
    return NextResponse.json({ success: true, account });
  } catch (err) {
    return financeErrorResponse(err, 'PATCH /api/admin/finance/accounts/[id]');
  }
}
