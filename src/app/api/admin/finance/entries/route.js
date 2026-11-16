/**
 * GET  /api/admin/finance/entries — the ledger, newest first
 *   ?accountId=&type=&categoryId=&from=&to=&limit=&offset=   (format=csv → every row as CSV)
 * POST /api/admin/finance/entries — record a manual entry
 *   Body: { kind: 'OPENING_BALANCE'|'EXPENSE'|'OTHER_INCOME'|'ADJUSTMENT'|'TRANSFER',
 *           accountId, toAccountId?, amount, effectiveAt?, direction?, categoryId?,
 *           description?, proofS3Key?, excludeFromProfit? }
 *
 * Auth: requireAdminUser. POST is audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson } from '../_shared';

const TYPES = [
  'OPENING_BALANCE', 'SESSION_CHARGE', 'EVENT_CHARGE', 'WOMPI_FEE', 'TUTOR_PAYOUT', 'EVENT_TUTOR_PAYOUT',
  'GMF', 'REFUND', 'TRANSFER', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT', 'REVERSAL',
];

const querySchema = z.object({
  accountId: z.string().uuid().optional().catch(undefined),
  categoryId: z.string().uuid().optional().catch(undefined),
  type: z.enum(TYPES).optional().catch(undefined),
  from: z.string().datetime({ offset: true }).optional().catch(undefined),
  to: z.string().datetime({ offset: true }).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  offset: z.coerce.number().int().min(0).catch(0),
});

const bodySchema = z.object({
  kind: z.enum(['OPENING_BALANCE', 'EXPENSE', 'OTHER_INCOME', 'ADJUSTMENT', 'TRANSFER']),
  accountId: z.string().uuid('Selecciona una cuenta'),
  toAccountId: z.string().uuid().optional(),
  amount: z.number().positive('El monto debe ser mayor a 0').max(1_000_000_000),
  effectiveAt: z.string().datetime({ offset: true }).optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().trim().max(500).optional(),
  proofS3Key: z.string().max(200).optional(),
  excludeFromProfit: z.boolean().optional(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const q = querySchema.parse(Object.fromEntries(
    ['accountId', 'categoryId', 'type', 'from', 'to', 'limit', 'offset'].map((k) => [k, searchParams.get(k) ?? undefined]),
  ));
  const filters = {
    accountId: q.accountId,
    categoryId: q.categoryId,
    type: q.type,
    from: q.from ? new Date(q.from) : undefined,
    to: q.to ? new Date(q.to) : undefined,
  };
  try {
    if (searchParams.get('format') === 'csv') {
      const csv = await financeService.exportEntriesCsv(filters);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="calico-movimientos.csv"',
          'Cache-Control': 'no-store',
        },
      });
    }
    const { items, total } = await financeService.listEntries({ ...filters, limit: q.limit, offset: q.offset });
    return NextResponse.json({ success: true, items, total });
  } catch (err) {
    return financeErrorResponse(err, 'GET /api/admin/finance/entries');
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  const { kind, ...data } = parsed.data;
  try {
    const entries = await financeService.createManualEntry({ adminId: auth.sub, kind, data, request });
    return NextResponse.json({ success: true, entries }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/entries');
  }
}
