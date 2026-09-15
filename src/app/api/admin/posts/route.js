/**
 * /api/admin/posts
 *
 * GET — library of Instagram posts published from the content-creator tool
 *       (S3 bucket AWS_S3_POSTS_BUCKET, `marketing-posts/`), newest first, with presigned cover URLs.
 *
 * Auth: requireAdminUser (DB-fresh role check + rate limit).
 */

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as marketingPostService from '@/lib/services/marketing-post.service';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const posts = await marketingPostService.listPosts();
    return NextResponse.json({ success: true, posts });
  } catch (err) {
    console.error('[GET /api/admin/posts]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al cargar los posts' },
      { status: 500 },
    );
  }
}
