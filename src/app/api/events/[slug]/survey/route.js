/**
 * POST /api/events/[slug]/survey — the post-event survey of a Confirmed
 * registrant (spec §6.1). Each tutor rating becomes a Review that counts in
 * the tutor's public rating.
 *
 * Body: { attended: boolean, eventRating?: 1–5, tutorRatings?: [{ tutorId, rating: 1–5, comment?: ≤ 1000 }],
 *         heardFrom: one of HEARD_FROM_OPTIONS, heardFromDetail?: ≤ 120 (with 'other'),
 *         wouldRecommend?: one of RECOMMEND_OPTIONS (required when attended) }
 * Presence rules live in event-survey.service (INVALID_SURVEY).
 * Auth: authenticateRequest; the user is always auth.sub. 10 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventSurveyService from '@/lib/services/event-survey.service';
import { HEARD_FROM_DETAIL_MAX, HEARD_FROM_OPTIONS, RECOMMEND_OPTIONS } from '@/lib/events/survey-questions';
import { eventsErrorResponse, invalidBody, readJsonBody } from '../../_errors';

const surveySchema = z.object({
  attended: z.boolean(),
  eventRating: z.number().int().min(1).max(5).optional(),
  tutorRatings: z.array(z.object({
    tutorId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  })).max(10).optional(),
  heardFrom: z.enum(HEARD_FROM_OPTIONS).optional(),
  heardFromDetail: z.string().trim().max(HEARD_FROM_DETAIL_MAX).optional(),
  wouldRecommend: z.enum(RECOMMEND_OPTIONS).optional(),
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
