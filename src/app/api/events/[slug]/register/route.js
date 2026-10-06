/**
 * POST /api/events/[slug]/register — free registration (idempotent).
 *
 * Body (optional): { source?: string, marketingOptIn?: boolean }
 * Auth: authenticateRequest; the user is always auth.sub. 10 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventCheckoutService from '@/lib/services/event-checkout.service';
import { eventsErrorResponse, invalidBody, parseRegistrationBody, readJsonBody } from '../../_errors';

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`events:${auth.sub}`, { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { slug } = await params;
  const input = parseRegistrationBody(await readJsonBody(request));
  if (!input) return invalidBody();

  try {
    const registration = await eventCheckoutService.registerFree({ slug, userId: auth.sub, ...input });
    return NextResponse.json(
      { success: true, registration: { id: registration.id, status: registration.status } },
      { status: 201 },
    );
  } catch (err) {
    return eventsErrorResponse(err, 'POST /api/events/[slug]/register');
  }
}
