/**
 * /api/admin/coupons
 *
 * GET  — list every coupon with its usage stats and computed status.
 *        Query: ?status=all|active|inactive|scheduled|expired|exhausted|deleted
 *               &search=<code fragment>
 * POST — create a coupon. The creator is always the authenticated admin
 *        (auth.sub), never a body field.
 *
 * Auth: requireAdminUser (DB-fresh role check + rate limit) on both verbs.
 * Every mutation is recorded in the admin audit log by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as couponService from '@/lib/services/coupon.service';
import { couponFieldSchemas, couponErrorResponse } from './_schemas';

const listQuerySchema = z.object({
  status: z.enum(['all', 'active', 'inactive', 'scheduled', 'expired', 'exhausted', 'deleted']).default('all'),
  search: z.string().trim().max(24).default(''),
});

const createSchema = z.object({
  code: couponFieldSchemas.code,
  description: couponFieldSchemas.description,
  discountType: couponFieldSchemas.discountType,
  discountValue: couponFieldSchemas.discountValue,
  absorber: couponFieldSchemas.absorber.optional(),
  maxRedemptions: couponFieldSchemas.maxRedemptions.optional(),
  perUserLimit: couponFieldSchemas.perUserLimit.optional(),
  firstSessionOnly: couponFieldSchemas.firstSessionOnly.optional(),
  validFrom: couponFieldSchemas.date.optional(),
  validUntil: couponFieldSchemas.date.optional(),
  isActive: couponFieldSchemas.isActive.optional(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Parámetros inválidos' }, { status: 400 });
  }

  try {
    const { items, total } = await couponService.listCoupons(parsed.data);
    return NextResponse.json({ success: true, coupons: items, total });
  } catch (err) {
    return couponErrorResponse(err, 'GET /api/admin/coupons');
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    );
  }

  try {
    const coupon = await couponService.createCoupon({
      adminId: auth.sub,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, coupon }, { status: 201 });
  } catch (err) {
    return couponErrorResponse(err, 'POST /api/admin/coupons');
  }
}
