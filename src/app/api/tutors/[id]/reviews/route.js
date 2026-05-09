/**
 * GET /api/tutors/:id/reviews
 *
 * Paginated reviews received by a tutor, with optional filtering by course.
 * Powers the reviews section of the tutor detail page.
 *
 * Query params:
 *   - courseId  (optional) — filter to a single course
 *   - page      (default 1)
 *   - pageSize  (default 10, max 50)
 *   - sort      (default 'recent') — 'recent' | 'highest' | 'lowest'
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as reviewService from '@/lib/services/review.service';

const VALID_SORTS = new Set(['recent', 'highest', 'lowest']);

export async function GET(request, { params }) {
  const { id } = await params;
  const tutorId = typeof id === 'string' ? id.trim() : String(id);
  if (!tutorId) {
    return NextResponse.json({ success: false, error: 'Tutor ID is required' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get('courseId') || null;
  const sortRaw = searchParams.get('sort') || 'recent';
  const sort = VALID_SORTS.has(sortRaw) ? sortRaw : 'recent';

  const pageRaw = parseInt(searchParams.get('page') || '1', 10);
  const pageSizeRaw = parseInt(searchParams.get('pageSize') || '10', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(
    50,
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 10,
  );

  const offset = (page - 1) * pageSize;

  const { items, total } = await reviewService.getReviewsReceivedPaginated(tutorId, {
    courseId,
    limit: pageSize,
    offset,
    sort,
  });

  return NextResponse.json({
    success: true,
    reviews: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: offset + items.length < total,
    },
    filter: { courseId, sort },
  });
}
