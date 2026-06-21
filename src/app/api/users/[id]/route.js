/**
 * GET /api/users/:id
 *   Own profile → full data.
 *   Other user  → public projection only (name, profilePictureUrl, career).
 *   Admin       → full data for any user.
 *
 * PUT /api/users/:id — Update own profile (authenticated, own profile only).
 *
 * SECURITY: PUT accepts a strict whitelist of fields ({ name, phoneNumber,
 * careerId }). Any other key in the body is rejected with 400 to prevent
 * mass-assignment. `careerId` is additionally checked against the Career
 * table so a syntactically-valid-but-nonexistent id surfaces a clean 400
 * instead of a Prisma foreign-key 500.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userService from '@/lib/services/user.service';
import * as academicService from '@/lib/services/academic.service';

function parseUserIdParam(id) {
  if (id == null || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Fields visible to any authenticated caller for a third-party profile. */
function toPublicProfile(user) {
  return {
    id: user.id,
    name: user.name,
    profilePictureUrl: user.profilePictureUrl ?? null,
    career: user.career ?? null,
    isTutorApproved: user.isTutorApproved ?? false,
  };
}

const updateUserBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'El nombre no puede estar vacío')
      .max(120, 'El nombre no puede exceder 120 caracteres')
      .optional(),
    phoneNumber: z
      .union([z.string().max(30, 'El teléfono no puede exceder 30 caracteres'), z.null()])
      .transform((v) => {
        if (v === null) return null;
        const trimmed = v.trim();
        return trimmed.length === 0 ? null : trimmed;
      })
      .optional(),
    careerId: z.string().uuid('La carrera seleccionada no es válida').optional(),
  })
  .strict('Campo no permitido')
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Debes enviar al menos un campo para actualizar' },
  );

export async function GET(request, { params }) {
  const auth = await authenticateRequest(request);
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

  const callerId = String(auth.sub ?? '');
  const isOwner = callerId === String(userId);
  const isAdmin = auth.role === 'ADMIN';

  // Owner and admins receive the full profile; everyone else gets only public fields
  const payload = isOwner || isAdmin ? user : toPublicProfile(user);

  return NextResponse.json({ success: true, user: payload });
}

export async function PUT(request, { params }) {
  const auth = await authenticateRequest(request);
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Body inválido (JSON malformado)' },
      { status: 400 },
    );
  }

  const parsed = updateUserBodySchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Datos inválidos';
    return NextResponse.json(
      { success: false, error: firstError, details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Reject a well-formed UUID that doesn't point to a real career, so the
  // foreign key never fails at the DB layer (clean 400 instead of a 500).
  if (parsed.data.careerId) {
    const career = await academicService.getCareerById(parsed.data.careerId);
    if (!career) {
      return NextResponse.json(
        { success: false, error: 'La carrera seleccionada no existe' },
        { status: 400 },
      );
    }
  }

  const user = await userService.updateUser(userId, parsed.data);

  return NextResponse.json({ success: true, user });
}
