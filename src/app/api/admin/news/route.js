/**
 * /api/admin/news
 *
 * GET  — editorial list (drafts included) for the admin panel.
 * POST — create a post. Author is always the authenticated admin
 *        (auth.sub), never a body field.
 *
 * Auth: requireAdminUser (DB-fresh role check + rate limit) on both verbs.
 * Every mutation is recorded in the admin audit log.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as newsService from '@/lib/services/news.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const MAX_TITLE = 200;
const MAX_CONTENT = 20000;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  title: z.string().trim().min(1, 'El título es requerido').max(MAX_TITLE),
  content: z.string().min(1, 'El contenido es requerido').max(MAX_CONTENT),
  imageS3Key: z.string().max(512).nullable().optional(),
  isPublished: z.boolean().optional(),
  isPinned: z.boolean().optional(),
});

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Parámetros inválidos' },
        { status: 400 },
      );
    }

    const { items, total } = await newsService.listAll(parsed.data);
    return NextResponse.json({ success: true, posts: items, total });
  } catch (err) {
    console.error('[GET /api/admin/news]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al cargar las publicaciones' },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let rawBody;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Cuerpo JSON inválido' },
      { status: 400 },
    );
  }

  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 },
    );
  }

  try {
    const post = await newsService.createPost({
      ...parsed.data,
      imageS3Key: parsed.data.imageS3Key ?? undefined,
      authorId: auth.sub,
    });

    await logAction({
      adminId: auth.sub,
      action: ADMIN_ACTIONS.NEWS_CREATE,
      targetType: 'NewsPost',
      targetId: post.id,
      payload: { title: post.title, isPublished: post.isPublished },
      request,
    });

    return NextResponse.json({ success: true, post }, { status: 201 });
  } catch (err) {
    if (err.code === 'VALIDATION_ERROR' || err.code === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === 'NOT_FOUND' ? 404 : 400 },
      );
    }
    console.error('[POST /api/admin/news]:', err.message);
    return NextResponse.json(
      { success: false, error: 'Error al crear la publicación' },
      { status: 500 },
    );
  }
}
