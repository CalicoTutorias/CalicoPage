export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as courseManagement from '@/lib/services/course-management.service';
import { basePriceSchema, courseCodeSchema } from './_schemas';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const codeSchema = courseCodeSchema;
const nameSchema = z.string().trim().min(3).max(160);
const complexitySchema = z.enum(['Introductory', 'Foundational', 'Challenging']);
const careerIdSchema = z.string().uuid();
const aliasesSchema = z.array(z.string().trim().max(60)).max(30);

const bodySchema = z.object({
  code: codeSchema,
  name: nameSchema,
  complexity: complexitySchema,
  basePrice: basePriceSchema,
  careerId: careerIdSchema,
  aliases: aliasesSchema.optional(),
});

const UPDATABLE_FIELDS = ['code', 'name', 'complexity', 'careerId', 'aliases', 'basePrice'];

const updateCourseSchema = z
  .object({
    courseId: z.string().uuid(),
    code: codeSchema.optional(),
    name: nameSchema.optional(),
    complexity: complexitySchema.optional(),
    careerId: careerIdSchema.optional(),
    aliases: aliasesSchema.optional(),
    basePrice: basePriceSchema.optional(),
  })
  .refine((data) => UPDATABLE_FIELDS.some((field) => data[field] !== undefined), {
    message: 'NO_CHANGES',
  });

function parsePageParam(value, fallback, max) {
  const n = parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(n, max));
}

/**
 * GET /api/admin/courses?search=&limit=&offset=
 * Catálogo paginado para el admin; búsqueda en código, nombre y aliases.
 */
export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, parsePageParam(searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const offset = parsePageParam(searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER);
  const search = (searchParams.get('search') || '').slice(0, 100);

  try {
    const { courses, total } = await courseManagement.listCoursesForAdmin({ search, limit, offset });
    return NextResponse.json({ success: true, courses, total, limit, offset });
  } catch (err) {
    console.error('[GET /api/admin/courses]', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 422 },
    );
  }

  try {
    const course = await courseManagement.createCourseAsAdmin({
      adminId: auth.sub,
      data: parsed.data,
      request,
    });
    return NextResponse.json({ success: true, course }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'COURSE_EXISTS' }, { status: 409 });
    }
    if (err.code === 'P2003') {
      return NextResponse.json({ success: false, error: 'INVALID_CAREER' }, { status: 422 });
    }
    console.error('[POST /api/admin/courses]', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/courses
 * Body: { courseId, code?, name?, complexity?, careerId?, aliases?, basePrice? }
 */
export async function PATCH(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = updateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'INVALID_INPUT' },
      { status: 422 },
    );
  }

  const { courseId, ...changes } = parsed.data;

  try {
    const course = await courseManagement.updateCourseAsAdmin({
      adminId: auth.sub,
      courseId,
      changes,
      request,
    });
    return NextResponse.json({ success: true, course });
  } catch (err) {
    if (err.code === 'P2025' || err.code === 'COURSE_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'COURSE_NOT_FOUND' }, { status: 404 });
    }
    if (err.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'COURSE_EXISTS' }, { status: 409 });
    }
    if (err.code === 'P2003') {
      return NextResponse.json({ success: false, error: 'INVALID_CAREER' }, { status: 422 });
    }
    console.error('[PATCH /api/admin/courses] Failed to update course', err.message);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
