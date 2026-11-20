/**
 * /api/admin/batch-discount — descuento por bloque (horas seguidas).
 *
 * GET — current config + last changes.
 * PUT — replace the config (all fields). Validated and audited by the service.
 *
 * Auth: requireAdminUser (DB-fresh role check + rate limit) on both verbs.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as batchDiscountService from '@/lib/services/batch-discount.service';
import { MAX_TIERS, TIER_MAX_PERCENT } from '@/lib/payments/batch-discount';

const putSchema = z.object({
  isActive: z.boolean(),
  tiers: z.array(z.number().int().min(0).max(TIER_MAX_PERCENT)).min(1).max(MAX_TIERS),
  absorber: z.enum(['CALICO', 'SHARED']),
  stacksWithCoupons: z.boolean(),
  appliesToManual: z.boolean(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const [config, changes] = await Promise.all([
      batchDiscountService.getConfigForAdmin(),
      batchDiscountService.recentChanges(3),
    ]);
    return NextResponse.json({ success: true, config, changes });
  } catch (err) {
    console.error('[GET /api/admin/batch-discount]:', err?.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let parsed;
  try {
    parsed = putSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const config = await batchDiscountService.updateConfig({ adminId: auth.sub, data: parsed.data, request });
    return NextResponse.json({ success: true, config });
  } catch (err) {
    if (err instanceof batchDiscountService.BatchDiscountError) {
      return NextResponse.json({ success: false, error: err.code }, { status: 400 });
    }
    console.error('[PUT /api/admin/batch-discount]:', err?.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
