/**
 * PUT /api/admin/posts/[slug]/agenda — set the planned publication date and/or
 * mark the post as already on Instagram (someone uploads it by hand; the admin
 * only confirms it). Body: { plannedFor?: 'YYYY-MM-DD'|null, instagram?: boolean,
 * instagramDate?: 'YYYY-MM-DD' }. Stored on the content-creator piece, so the
 * tool sees it too.
 *
 * Auth: requireAdminUser. Audit-logged.
 */

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as marketingPieceService from '@/lib/services/marketing-piece.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const STATUS = { VALIDATION_ERROR: 400, NOT_FOUND: 404, CONFLICT: 409 };

export async function PUT(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
  }

  try {
    const agenda = await marketingPieceService.setAgenda(slug, body, auth);
    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.MARKETING_POST_AGENDA,
      targetType: 'MarketingPost',
      targetId: slug,
      payload: { plannedFor: agenda.plannedFor, instagramPublishedAt: agenda.instagramPublishedAt },
      request,
    });
    return NextResponse.json({ success: true, agenda });
  } catch (err) {
    const status = STATUS[err.code];
    if (status) return NextResponse.json({ success: false, error: err.message }, { status });
    console.error('[PUT /api/admin/posts/[slug]/agenda]:', err.message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
