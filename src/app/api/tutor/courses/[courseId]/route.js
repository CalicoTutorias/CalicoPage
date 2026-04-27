/**
 * DELETE /api/tutor/courses/:courseId — Remove a course from the tutor's catalog
 * PUT    /api/tutor/courses/:courseId — Update the custom price for a course
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

const updatePriceSchema = z.object({
  customPrice: z.number().positive('Price must be positive'),
});

export async function PUT(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { courseId } = await params;

  const body = await request.json();
  const parsed = updatePriceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const tutorCourse = await prisma.tutorCourse.update({
      where: {
        tutorId_courseId: { tutorId: auth.sub, courseId },
      },
      data: { customPrice: parsed.data.customPrice },
      include: { course: true },
    });

    return NextResponse.json({ success: true, tutorCourse });
  } catch (error) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Course not in your catalog' },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function DELETE(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { courseId } = await params;

  try {
    await prisma.tutorCourse.delete({
      where: {
        tutorId_courseId: { tutorId: auth.sub, courseId },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Course not in your catalog' },
        { status: 404 },
      );
    }
    throw error;
  }
}
