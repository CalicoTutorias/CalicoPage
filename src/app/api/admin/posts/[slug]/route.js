/**
 * /api/admin/posts/[slug]
 *
 * GET    — post detail: caption + presigned preview URL per file.
 * DELETE — remove the post and every file under its S3 folder.
 *
 * Auth: requireAdminUser on both verbs. Deletion is audit-logged.
 */

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as marketingPostService from '@/lib/services/marketing-post.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

function serviceErrorResponse(err, routeTag) {
  if (err.code === 'VALIDATION_ERROR') {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
  if (err.code === 'NOT_FOUND') {
    return NextResponse.json({ success: false, error: err.message }, { status: 404 });
  }
  console.error(`[${routeTag}]:`, err.message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  try {
    const post = await marketingPostService.getPost(slug);
    return NextResponse.json({ success: true, post });
  } catch (err) {
    return serviceErrorResponse(err, 'GET /api/admin/posts/[slug]');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  try {
    const result = await marketingPostService.deletePost(slug);

    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.MARKETING_POST_DELETE,
      targetType: 'MarketingPost',
      targetId: slug,
      payload: { title: result.title, removedObjects: result.removed },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return serviceErrorResponse(err, 'DELETE /api/admin/posts/[slug]');
  }
}
