/**
 * GET  /api/admin/finance/session-refunds — paid sessions that were canceled or
 *      rejected and not refunded yet, plus the refunds already made
 * POST /api/admin/finance/session-refunds — refund (all or part of) a tutoring payment
 *   Body: { paymentId, amount?: number (default: all), accountId, refundedAt?, reason, proofS3Key }
 * The Wompi fee is not recovered. The ledger projects the refund (and its
 * 4x1000) from the payment row.
 *
 * Auth: requireAdminUser. Audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as financeService from '@/lib/services/finance-ledger.service';
import { financeErrorResponse, invalidBody, readJson } from '../_shared';

const bodySchema = z.object({
  paymentId: z.string().uuid('Pago inválido'),
  amount: z.number().positive().optional(),
  accountId: z.string().uuid().optional(),
  refundedAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(1, 'Indica el motivo de la devolución').max(500),
  proofS3Key: z.string().max(200).optional(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ success: true, ...(await financeService.listSessionRefunds()) });
  } catch (err) {
    return financeErrorResponse(err, 'GET /api/admin/finance/session-refunds');
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  const parsed = bodySchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalidBody(parsed);
  try {
    const refund = await financeService.refundSessionPayment({ adminId: auth.sub, ...parsed.data, request });
    return NextResponse.json({ success: true, refund }, { status: 201 });
  } catch (err) {
    return financeErrorResponse(err, 'POST /api/admin/finance/session-refunds');
  }
}
