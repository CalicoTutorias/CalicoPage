/**
 * GET /api/news
 *
 * Public feed of published news/announcements for the landing page and the
 * student/tutor homes.
 *
 * Auth: NONE — intentionally public. It only ever exposes posts with
 *       isPublished = true through the repository's PUBLIC_SELECT (no drafts,
 *       no author identity, no editorial metadata).
 *
 * Query: ?limit=1..20 (default 6), ?offset>=0 (default 0)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as newsService from '@/lib/services/news.service';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Parámetros inválidos' },
        { status: 400 },
      );
    }

    const posts = await newsService.listPublished(parsed.data);
    return NextResponse.json({ success: true, posts });
  } catch (err) {
    console.error('[GET /api/news]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al cargar las noticias' },
      { status: 500 },
    );
  }
}
