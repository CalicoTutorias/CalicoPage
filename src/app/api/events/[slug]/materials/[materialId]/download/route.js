/**
 * GET /api/events/[slug]/materials/[materialId]/download
 *
 * A presigned S3 download URL (5 min, Content-Disposition: attachment) for
 * one material file. Same gate as the list: Confirmed + survey answered.
 *
 * Auth: authenticateRequest; the user is always auth.sub. 30 calls/min.
 * Returns: { success: true, url, fileName }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit } from '@/lib/auth/rateLimit';
import * as eventMaterialService from '@/lib/services/event-material.service';
import { eventsErrorResponse } from '../../../../_errors';

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const limited = rateLimit(`event-materials:${auth.sub}`, { max: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { slug, materialId } = await params;
  try {
    const result = await eventMaterialService.getMaterialDownloadUrl({ slug, userId: auth.sub, materialId });
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return eventsErrorResponse(err, 'GET /api/events/[slug]/materials/[materialId]/download');
  }
}
