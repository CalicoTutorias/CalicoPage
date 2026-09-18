/**
 * /api/admin/posts/[slug]/files/[name]
 *
 * GET — authenticated proxy that streams one PNG of a post (or the PDF of a
 * presentation).
 *
 * Why a proxy instead of the presigned URL: the admin page turns the images
 * into File objects for `navigator.share` ("Guardar en el celular"), which
 * needs readable same-origin bytes. Proxying avoids a bucket CORS policy and
 * keeps the objects private. Only names listed in the manifest are served.
 *
 * Auth: requireAdminUser.
 */

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as marketingPostService from '@/lib/services/marketing-post.service';

export async function GET(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { slug, name } = await params;
  try {
    const file = await marketingPostService.getPostFile(slug, name);
    const headers = {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${slug}-${name}"`,
      'Cache-Control': 'private, no-store',
    };
    if (typeof file.contentLength === 'number') {
      headers['Content-Length'] = String(file.contentLength);
    }
    return new Response(file.body.transformToWebStream(), { status: 200, headers });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    if (err.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    console.error('[GET /api/admin/posts/[slug]/files/[name]]:', err.message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
