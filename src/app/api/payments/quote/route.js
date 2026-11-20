/**
 * POST /api/payments/quote
 * Price of a booking (list price, block discount, price of each hour) and
 * whether the student can extend it by one more consecutive hour. Feeds the
 * "¿Necesitas más tiempo?" box of the checkout. Reserves nothing.
 *
 * Body: { tutorId, courseId, startTimestamp, endTimestamp }
 *
 * Response (200):
 *   { success: true,
 *     quote: { pricePerHour, hours, listAmount, batchDiscountAmount, amount,
 *              hourly: [{ index, percent, price }], batchActive },
 *     maxConsecutiveHours,
 *     next: { available, reason?, endTimestamp, price, percent, amount } | null }
 *
 * Security: authenticated (the extension check needs the student for the
 * self-booking rule); amounts are computed server-side; rate-limited.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as bookingPricing from '@/lib/services/booking-pricing.service';
import * as sessionService from '@/lib/services/session.service';
import * as availabilityService from '@/lib/services/availability.service';
import { isBookingRefusal } from '@/lib/payments/booking-refusals';
import { computeBatchPricing, DEFAULT_MAX_CONSECUTIVE_HOURS } from '@/lib/payments/batch-discount';

const MS_PER_HOUR = 3_600_000;

const bodySchema = z.object({
  tutorId: z.string().trim().min(1),
  courseId: z.string().trim().min(1),
  startTimestamp: z.string().datetime(),
  endTimestamp: z.string().datetime(),
});

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const studentId = String(auth.sub ?? '').trim();
  if (!studentId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const limited = rateLimit(`booking-quote:${studentId}`, { max: 60, windowMs: 60_000 });
  if (limited) return limited;

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' }, { status: 400 });
  }

  const { tutorId, courseId } = parsed.data;
  const start = new Date(parsed.data.startTimestamp);
  const end = new Date(parsed.data.endTimestamp);

  let quote;
  try {
    quote = await bookingPricing.quoteBlock({ courseId, startTimestamp: start, endTimestamp: end });
  } catch (err) {
    if (err && err.name === 'PricingError') {
      const status = err.code === 'COURSE_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ success: false, error: err.message }, { status });
    }
    console.error('[POST /api/payments/quote]:', err?.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }

  const schedule = await availabilityService.getSchedule(tutorId);
  const maxConsecutiveHours = schedule?.maxConsecutiveHours ?? DEFAULT_MAX_CONSECUTIVE_HOURS;

  // Can the block grow by one hour? Same rules create-intent enforces.
  let next = null;
  if (Number.isInteger(quote.hours) && quote.hours < maxConsecutiveHours) {
    const nextEnd = new Date(end.getTime() + MS_PER_HOUR);
    const grown = computeBatchPricing({ pricePerHour: quote.pricePerHour, hours: quote.hours + 1, config: quote.config });
    const added = grown.hourly[grown.hourly.length - 1];
    next = {
      available: true,
      endTimestamp: nextEnd.toISOString(),
      price: added?.price ?? quote.pricePerHour,
      percent: added?.percent ?? 0,
      amount: grown.amount,
    };
    try {
      await sessionService.assertSlotBookable(studentId, { tutorId, courseId, startTimestamp: start, endTimestamp: nextEnd });
    } catch (err) {
      if (!isBookingRefusal(err)) throw err;
      next = { ...next, available: false, reason: err.code };
    }
  }

  const { batch } = quote;
  return NextResponse.json({
    success: true,
    quote: {
      pricePerHour: quote.pricePerHour,
      hours: quote.hours,
      listAmount: batch.listAmount,
      batchDiscountAmount: batch.batchDiscountAmount,
      amount: batch.amount,
      hourly: batch.hourly,
      batchActive: Boolean(quote.config.isActive),
    },
    maxConsecutiveHours,
    next,
  });
}
