/**
 * Shared zod field schemas + error mapping for the admin coupon routes.
 * Range rules mirror src/lib/payments/coupon-math.js; the service re-checks
 * the cross-field rules (type/value, date order) on the merged result.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  COUPON_CODE_MAX_LENGTH,
  FIXED_MAX_COP,
} from '@/lib/payments/coupon-math';

const nullableDate = z
  .union([z.string().datetime(), z.null(), z.literal('')])
  .transform((v) => (v === '' ? null : v));

export const couponFieldSchemas = {
  code: z.string().trim().min(3, 'El código debe tener al menos 3 caracteres').max(COUPON_CODE_MAX_LENGTH),
  description: z.string().trim().max(300).nullable().optional(),
  discountType: z.enum(['PERCENT', 'FIXED']),
  discountValue: z.coerce.number().int('El valor debe ser un entero').positive().max(FIXED_MAX_COP),
  absorber: z.enum(['CALICO', 'SHARED']),
  maxRedemptions: z
    .union([z.coerce.number().int().min(1).max(1_000_000), z.null(), z.literal('')])
    .transform((v) => (v === '' ? null : v)),
  perUserLimit: z.coerce.number().int().min(1).max(1_000),
  firstSessionOnly: z.boolean(),
  date: nullableDate,
  isActive: z.boolean(),
};

const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  COUPON_CODE_EXISTS: 409,
  COUPON_CODE_LOCKED: 409,
};

/** Map a service error to an HTTP response; unknown errors become a 500. */
export function couponErrorResponse(err, routeTag) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    return NextResponse.json({ success: false, error: err.message, code: err.code }, { status });
  }
  console.error(`[${routeTag}]:`, err?.message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}
