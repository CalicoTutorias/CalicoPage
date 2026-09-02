/**
 * POST /api/payments/validate-coupon
 * Preview a coupon for a booking BEFORE paying. Validates everything the
 * checkout needs to show "Antes · Ahora · Ahorras" but reserves nothing —
 * the hold is taken by /api/payments/create-intent.
 *
 * Body:
 *   code:           string (the only coupon input the client ever sends)
 *   courseId:       string (UUID)
 *   startTimestamp: ISO string
 *   endTimestamp:   ISO string
 *
 * Security:
 *   - Authenticated: the redemption user is auth.sub, never a body field.
 *   - Rate-limited per user so the checkout can't be used to enumerate codes.
 *   - The list price is recomputed server-side (course price × hours); the
 *     discount is computed from the coupon, never from the client.
 *   - Unknown, deleted and inactive codes all answer "no válido": the
 *     response never reveals whether a disabled code exists, nor any counter.
 *
 * Response (200):
 *   { success: true, valid: true,  coupon: { code, description, discountType, discountValue },
 *                                 pricing: { originalAmount, discountAmount, amount, capped } }
 *   { success: true, valid: false, reason: 'COUPON_EXPIRED' | ... }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import { resolveSessionAmount } from '@/lib/payments/pricing';
import { COUPON_CODE_MAX_LENGTH } from '@/lib/payments/coupon-math';
import * as couponService from '@/lib/services/coupon.service';

const bodySchema = z.object({
  code: z.string().trim().min(1).max(COUPON_CODE_MAX_LENGTH),
  courseId: z.string().trim().min(1),
  startTimestamp: z.string().datetime(),
  endTimestamp: z.string().datetime(),
});

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const userId = String(auth.sub ?? '').trim();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // 20 previews per minute per user is plenty for a human, useless for a brute force.
  const limited = rateLimit(`coupon-validate:${userId}`, { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 400 },
    );
  }

  const { code, courseId, startTimestamp, endTimestamp } = parsed.data;

  // Authoritative list price — same resolver create-intent signs with.
  let priced;
  try {
    priced = await resolveSessionAmount({
      courseId,
      startTimestamp: new Date(startTimestamp),
      endTimestamp: new Date(endTimestamp),
    });
  } catch (err) {
    if (err && err.name === 'PricingError') {
      const status = err.code === 'COURSE_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ success: false, error: err.message }, { status });
    }
    throw err;
  }

  try {
    const { coupon, pricing } = await couponService.previewForBooking({
      code,
      userId,
      originalAmount: priced.amount,
    });
    return NextResponse.json({
      success: true,
      valid: true,
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      pricing: {
        originalAmount: pricing.originalAmount,
        discountAmount: pricing.discountAmount,
        amount: pricing.finalAmount,
        capped: Boolean(pricing.capped),
      },
    });
  } catch (err) {
    if (couponService.isCouponError(err)) {
      return NextResponse.json({ success: true, valid: false, reason: err.code });
    }
    console.error('[POST /api/payments/validate-coupon]:', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
