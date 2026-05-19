/**
 * POST /api/tutor-applications
 * Submit a new tutor application (authenticated students only).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { submitApplication } from '@/lib/services/tutor-application.service';

const applicationSchema = z.object({
  reasonsToTeach: z.string().min(20, 'Describe tu motivación con al menos 20 caracteres.'),
  subjects: z.array(z.string()).min(1, 'Selecciona al menos una materia.'),
  contactInfo: z.object({
    // Stored as "<dialCode> <local>": only +, spaces and digits, 7–18 digits.
    phone: z
      .string()
      .max(25)
      .regex(/^[+\d\s]+$/, 'Ingresa un número de contacto válido.')
      .refine((v) => {
        const d = v.replace(/\D/g, '');
        return d.length >= 7 && d.length <= 18;
      }, 'Ingresa un número de contacto válido.'),
    preferredMethod: z.enum(['WA', 'email', 'call']).default('WA'),
    llave: z.string().trim().min(1, 'Ingresa tu llave de pago.').max(200),
  }),
});

export async function POST(request) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    // Zod v3.20+ exposes issues; older alias `.errors` is deprecated.
    const firstIssue = parsed.error.issues?.[0] || parsed.error.errors?.[0];
    return NextResponse.json(
      { success: false, error: firstIssue?.message || 'Datos inválidos.' },
      { status: 422 },
    );
  }

  try {
    const application = await submitApplication(auth.sub, parsed.data);
    return NextResponse.json({ success: true, application }, { status: 201 });
  } catch (err) {
    if (err.code === 'ALREADY_PENDING') {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    console.error('[POST /api/tutor-applications]', err);
    return NextResponse.json({ success: false, error: 'Error interno del servidor.' }, { status: 500 });
  }
}
