/**
 * GET    /api/tutor/courses/:courseId — Get a single course from the tutor's catalog
 * PATCH  /api/tutor/courses/:courseId — Update experience for a course
 * DELETE /api/tutor/courses/:courseId — Remove a course from the tutor's catalog
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

const updateCourseSchema = z.object({
  experience: z.string().optional(),
});

export async function GET(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { courseId } = await params;

  try {
    const tutorCourse = await prisma.tutorCourse.findUnique({
      where: {
        tutorId_courseId: { tutorId: auth.sub, courseId },
      },
      include: { course: { include: { coursePrice: true } } },
    });

    if (!tutorCourse) {
      return NextResponse.json(
        { success: false, error: 'Course not in your catalog' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, course: tutorCourse });
  } catch (error) {
    console.error('Error fetching course:', error);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
  }
}

export async function PATCH(request, { params }) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { courseId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = updateCourseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    // Verify the tutor course exists
    const existing = await prisma.tutorCourse.findUnique({
      where: { tutorId_courseId: { tutorId: auth.sub, courseId } },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Course not in your catalog' },
        { status: 404 },
      );
    }

    // Update the experience field
    const updated = await prisma.tutorCourse.update({
      where: { tutorId_courseId: { tutorId: auth.sub, courseId } },
      data: {
        experience: parsed.data.experience?.trim() || null,
      },
      include: { course: { include: { coursePrice: true } } },
    });

    return NextResponse.json({ success: true, course: updated });
  } catch (error) {
    console.error('Error updating course experience:', error);
    return NextResponse.json(
      { success: false, error: 'Internal error' },
      { status: 500 },
    );
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
