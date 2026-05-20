/**
 * GET /api/users/:id  — Get user by ID (authenticated)
 * PUT /api/users/:id  — Update own profile (authenticated, own profile only)
 *
 * SECURITY: PUT accepts a strict whitelist of fields ({ name, phoneNumber }).
 * Any other key in the body — including privilege fields like `role`,
 * `isTutorApproved`, `isEmailVerified`, `profilePictureUrl`, or auth tokens —
 * is rejected with a 400. Internal services that legitimately set those
 * fields call `userRepository.update` directly; nothing should reach those
 * fields through this HTTP endpoint.
 *
 * Side-effect fields (avatar, tutor approval, etc.) have their own dedicated
 * endpoints with appropriate authorization checks.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userService from '@/lib/services/user.service';

function parseUserIdParam(id) {
  if (id == null || typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Strict allowlist for self-service profile edits. .strict() makes Zod reject
// the request when ANY unknown key is present, surfacing client mistakes
// loudly and blocking privilege escalation via mass-assignment.
//
// phoneNumber: we accept null OR an empty string to clear the field
// (the existing edit-profile form sends '' when the user has no phone yet —
// keeping this forgiving avoids a UX regression). Both are normalized to
// null before forwarding to the service.
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
  })
  .strict('Campo no permitido')
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Debes enviar al menos un campo para actualizar' },
  );

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

  // Parse + validate. Reject bad JSON, unknown fields, empty body.
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

  const user = await userService.updateUser(userId, parsed.data);

  return NextResponse.json({ success: true, user });
}
