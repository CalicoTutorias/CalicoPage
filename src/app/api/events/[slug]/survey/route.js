/**
 * POST /api/events/[slug]/survey — the post-event survey of a Confirmed
 * registrant (spec §6.1). Each tutor rating becomes a Review that counts in
 * the tutor's public rating.
 *
 * Body: { attended: boolean, eventRating?: 1–5, tutorRatings?: [{ tutorId, rating: 1–5, comment?: ≤ 1000 }] }
 * Auth: authenticateRequest; the user is always auth.sub. 10 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventSurveyService from '@/lib/services/event-survey.service';
import { eventsErrorResponse, invalidBody, readJsonBody } from '../../_errors';

const surveySchema = z.object({
  attended: z.boolean(),
  eventRating: z.number().int().min(1).max(5).optional(),
  tutorRatings: z.array(z.object({
    tutorId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  })).max(10).optional(),
});

export async function POST(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`survey:${auth.sub}`, { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { slug } = await params;
  const parsed = surveySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return invalidBody();

  try {
    await eventSurveyService.submitSurvey({ slug, userId: auth.sub, ...parsed.data });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    return eventsErrorResponse(err, 'POST /api/events/[slug]/survey');
  }
}
