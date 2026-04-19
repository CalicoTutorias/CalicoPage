/**
 * GET /api/users/:id  — Get user by ID (authenticated)
 * PUT /api/users/:id  — Update own profile (authenticated, own profile only)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userService from '@/lib/services/user.service';

/** User IDs are UUID strings (Prisma); never parseInt — e.g. parseInt("44d8bfce-...", 10) === 44 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUserIdParam(id) {
  if (id == null || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

export async function GET(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const userId = parseUserIdParam(id);
  if (!userId) {
    return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
  }

  const user = await userService.getUserById(userId);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Usuario no encontrado' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, user });
}

export async function PUT(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const userId = parseUserIdParam(id);
  if (!userId) {
    return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
  }

  if (auth.sub !== userId) {
    return NextResponse.json(
      { success: false, error: 'Forbidden: solo puedes actualizar tu propio perfil' },
      { status: 403 },
    );
  }

  const body = await request.json();
  const user = await userService.updateUser(userId, body);

  return NextResponse.json({ success: true, user });
}