/**
 * /api/admin/news/[id]
 *
 * PUT    — partial update (title, content, image, publish/unpublish, pin).
 * DELETE — remove the post (and its S3 image, best-effort).
 *
 * Auth: requireAdminUser on both verbs. Mutations are audit-logged.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as newsService from '@/lib/services/news.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const MAX_TITLE = 200;
const MAX_CONTENT = 20000;

const idSchema = z.string().uuid('Identificador inválido');

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'El título es requerido').max(MAX_TITLE).optional(),
    content: z.string().min(1, 'El contenido es requerido').max(MAX_CONTENT).optional(),
    // undefined = untouched · null = remove image · string = new upload
    imageS3Key: z.string().max(512).nullable().optional(),
    isPublished: z.boolean().optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Nada que actualizar',
  });

function serviceErrorResponse(err, routeTag) {
  if (err.code === 'VALIDATION_ERROR') {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
  if (err.code === 'NOT_FOUND') {
    return NextResponse.json({ success: false, error: err.message }, { status: 404 });
  }
  console.error(`[${routeTag}]:`, err.message);
  return NextResponse.json(
    { success: false, error: 'Error interno' },
    { status: 500 },
  );
}

export async function PUT(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json(
      { success: false, error: 'Identificador inválido' },
      { status: 400 },
    );
  }

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cuerpo JSON inválido' },
      { status: 400 },
    );
  }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    );
  }

  try {
    const post = await newsService.updatePost(id, parsed.data);

    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.NEWS_UPDATE,
      targetType: 'NewsPost',
      targetId: id,
      payload: {
        fields: Object.keys(parsed.data),
        isPublished: post.isPublished,
      },
      request,
    });

    return NextResponse.json({ success: true, post });
  } catch (err) {
    return serviceErrorResponse(err, 'PUT /api/admin/news/[id]');
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json(
      { success: false, error: 'Identificador inválido' },
      { status: 400 },
    );
  }

  try {
    const deleted = await newsService.deletePost(id);

    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.NEWS_DELETE,
      targetType: 'NewsPost',
      targetId: id,
      payload: { title: deleted.title },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return serviceErrorResponse(err, 'DELETE /api/admin/news/[id]');
  }
}
