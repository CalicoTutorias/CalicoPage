/**
 * POST /api/events/[slug]/cancel-registration — the user cancels a
 * Confirmed registration before the start. Paid and ≥ 6 h before: the
 * refund details are required and the payment is queued for refund.
 *
 * Body (optional): { refundMethod?: 'llave' | 'nequi' | 'use_future_session', refundMethodDetails?: string ≤ 200 }
 * Auth: authenticateRequest; the user is always auth.sub. 10 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventCheckoutService from '@/lib/services/event-checkout.service';
import { eventsErrorResponse, invalidBody, readJsonBody } from '../../_errors';

// Same options as the tutoring cancellation (CancellationModal → /api/sessions/[id]/cancel).
const REFUND_METHODS = ['llave', 'nequi', 'use_future_session'];

const cancelSchema = z.object({
  refundMethod: z.enum(REFUND_METHODS).nullish(),
  refundMethodDetails: z.string().trim().max(200).nullish(),
});

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`events:${auth.sub}`, { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { slug } = await params;
  const parsed = cancelSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return invalidBody();

  try {
    const { refundable } = await eventCheckoutService.cancelRegistration({
      slug,
      userId: auth.sub,
      refundMethod: parsed.data.refundMethod ?? null,
      refundMethodDetails: parsed.data.refundMethodDetails || null,
    });
    return NextResponse.json({ success: true, refundable });
  } catch (err) {
    return eventsErrorResponse(err, 'POST /api/events/[slug]/cancel-registration');
  }
}
