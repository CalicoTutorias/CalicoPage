/**
 * GET /api/users/:id/reviews/stats — Get average score and review count
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as reviewService from '@/lib/services/review.service';

export async function GET(request, { params }) {
  const { id } = await params;

  const stats = await reviewService.getReviewStats(id);

  return NextResponse.json({
    success: true,
    average: parseFloat(stats.average.toFixed(2)),
    count: stats.count,
  });
}
