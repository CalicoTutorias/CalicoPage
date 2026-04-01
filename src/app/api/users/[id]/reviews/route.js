/**
 * GET /api/users/:id/reviews — Get reviews received by a user
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as reviewService from '@/lib/services/review.service';

export async function GET(request, { params }) {
  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  const reviews = await reviewService.getReviewsReceived(id, limit);

  return NextResponse.json({ success: true, reviews, count: reviews.length });
}
