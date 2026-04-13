/**
 * GET /api/tutor/profile — Get the authenticated tutor's profile
 * PUT /api/tutor/profile — Update tutor profile fields
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

const updateSchema = z.object({
  bio: z.string().max(2000).optional(),
  experienceYears: z.number().int().min(0).optional(),
  experienceDescription: z.string().max(2000).optional(),
  credits: z.number().int().min(0).optional(),
});

export async function GET(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.tutorProfile.findUnique({
    where: { userId: auth.sub },
    include: {
      user: {
        select: { id: true, email: true, name: true, careerId: true, profilePictureUrl: true },
      },
      tutorCourses: { include: { course: true } },
    },
  });

  if (!profile) {
    return NextResponse.json(
      { success: false, error: 'Tutor profile not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, profile });
}

export async function PUT(request) {
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

  const profile = await prisma.tutorProfile.update({
    where: { userId: auth.sub },
    data: parsed.data,
    include: {
      user: {
        select: { id: true, email: true, name: true, careerId: true, profilePictureUrl: true },
      },
      tutorCourses: { include: { course: true } },
    },
  });

  return NextResponse.json({ success: true, profile });
}
