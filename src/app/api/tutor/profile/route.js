/**
 * GET /api/tutor/profile — Get the authenticated tutor's profile
 * PUT /api/tutor/profile — Update tutor profile fields
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

const llaveSchema = z
  .union([z.string().max(200), z.number().int()])
  .transform((value) => {
    if (typeof value === 'number') return String(value);
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const updateSchema = z.object({
  bio: z.string().max(2000).optional(),
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
    const auth = requireTutor(request);
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
    const auth = requireTutor(request);
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
    console.error('[PUT /api/tutor/profile] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
