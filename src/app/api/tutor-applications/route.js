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
    phone: z.string().min(7, 'Ingresa un número de contacto válido.'),
    preferredMethod: z.enum(['WA', 'email', 'call']).default('WA'),
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
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
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
