/**
 * /api/admin/coupons/[id]
 *
 * GET    — coupon detail + every redemption (who, when, amounts, session).
 * PUT    — partial update. Activate/deactivate = { isActive }. The code is
 *          locked once the coupon has any redemption.
 * DELETE — soft-delete when the coupon has redemptions, hard-delete otherwise.
 *
 * Auth: requireAdminUser on every verb. Mutations are audit-logged by the service.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as couponService from '@/lib/services/coupon.service';
import { couponFieldSchemas, couponErrorResponse } from '../_schemas';

const idSchema = z.string().uuid('Identificador inválido');

const updateSchema = z
  .object({
    code: couponFieldSchemas.code.optional(),
    description: couponFieldSchemas.description,
    discountType: couponFieldSchemas.discountType.optional(),
    discountValue: couponFieldSchemas.discountValue.optional(),
    absorber: couponFieldSchemas.absorber.optional(),
    maxRedemptions: couponFieldSchemas.maxRedemptions.optional(),
    perUserLimit: couponFieldSchemas.perUserLimit.optional(),
    firstSessionOnly: couponFieldSchemas.firstSessionOnly.optional(),
    validFrom: couponFieldSchemas.date.optional(),
    validUntil: couponFieldSchemas.date.optional(),
    isActive: couponFieldSchemas.isActive.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nada que actualizar' });

function invalidId() {
  return NextResponse.json({ success: false, error: 'Identificador inválido' }, { status: 400 });
}

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return invalidId();

  try {
    const detail = await couponService.getCouponDetail(id);
    return NextResponse.json({ success: true, ...detail });
  } catch (err) {
    return couponErrorResponse(err, 'GET /api/admin/coupons/[id]');
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return invalidId();

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    );
  }

  try {
    const coupon = await couponService.updateCoupon({
      adminId: auth.sub,
      id,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, coupon });
  } catch (err) {
    return couponErrorResponse(err, 'PUT /api/admin/coupons/[id]');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return invalidId();

  try {
    const result = await couponService.deleteCoupon({ adminId: auth.sub, id, request });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return couponErrorResponse(err, 'DELETE /api/admin/coupons/[id]');
  }
}
