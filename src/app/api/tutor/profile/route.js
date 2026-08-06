/**
 * GET /api/tutor/profile — Get the authenticated tutor's profile
 * PUT /api/tutor/profile — Update tutor profile fields
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';
import { TUTOR_BIO_MAX_LENGTH } from '@/config/profile';

const llaveSchema = z
  .union([z.string().max(200), z.number().int()])
  .transform((value) => {
    if (typeof value === 'number') return String(value);
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const updateSchema = z.object({
  // El máximo tiene que ser exactamente el ancho de la columna: si Zod acepta
  // más de lo que cabe en Postgres, el error sale como un 500 sin explicación.
  bio: z
    .string()
    .max(TUTOR_BIO_MAX_LENGTH, `La descripción no puede superar los ${TUTOR_BIO_MAX_LENGTH} caracteres.`)
    .optional(),
  experienceYears: z.number().int().min(0).optional(),
  experienceDescription: z.string().max(2000).optional(),
  credits: z.number().int().min(0).optional(),
  llave: llaveSchema.nullable().optional(),
});

const profileInclude = {
  user: {
    select: { id: true, email: true, name: true, careerId: true, profilePictureUrl: true },
  },
  tutorCourses: { include: { course: true } },
};

export async function GET(request) {
  try {
    const auth = await requireTutor(request);
    if (auth instanceof NextResponse) return auth;

    const profile = await prisma.tutorProfile.findUnique({
      where: { userId: auth.sub },
      include: profileInclude,
    });

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Tutor profile not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error('[GET /api/tutor/profile] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const auth = await requireTutor(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      select: { email: true },
    });

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: 'Tutor user email not found' },
        { status: 404 },
      );
    }

    const profile = await prisma.tutorProfile.upsert({
      where: { userId: auth.sub },
      create: {
        userId: auth.sub,
        schoolEmail: user.email,
        bio: parsed.data.bio ?? null,
        experienceYears: parsed.data.experienceYears ?? null,
        experienceDescription: parsed.data.experienceDescription ?? null,
        credits: parsed.data.credits ?? 0,
        llave: parsed.data.llave ?? null,
      },
      update: parsed.data,
      include: profileInclude,
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    // Un valor que no cabe en la columna es culpa de la petición, no del
    // servidor: devolver 500 escondía el motivo real y dejaba al tutor sin
    // saber por qué no se guardaba su descripción.
    if (error?.code === 'P2000' || error?.code === '22001') {
      return NextResponse.json(
        { success: false, error: `La descripción no puede superar los ${TUTOR_BIO_MAX_LENGTH} caracteres.` },
        { status: 400 },
      );
    }

    console.error('[PUT /api/tutor/profile] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
