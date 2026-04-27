/**
 * GET /api/users/:id  — Get user by ID (authenticated)
 * PUT /api/users/:id  — Update own profile (authenticated, own profile only)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userService from '@/lib/services/user.service';

function parseUserIdParam(id) {
  if (id == null || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  if (String(auth.sub) !== String(userId)) {
    return NextResponse.json(
      { success: false, error: 'Forbidden: solo puedes actualizar tu propio perfil' },
      { status: 403 },
    );
  }

  const body = await request.json();
  const user = await userService.updateUser(userId, body);

  return NextResponse.json({ success: true, user });
}