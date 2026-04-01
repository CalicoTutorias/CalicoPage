/**
 * GET    /api/tutor/courses — List tutor's courses with custom prices
 * POST   /api/tutor/courses — Add a course to the tutor's catalog
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

const addCourseSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  customPrice: z.number().positive('Price must be positive'),
  experience: z.string().optional(),
  workSampleUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export async function GET(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const tutorCourses = await prisma.tutorCourse.findMany({
    where: { tutorId: auth.sub },
    include: { course: true },
  });

  return NextResponse.json({ success: true, courses: tutorCourses });
}

export async function POST(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = addCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { courseId, customPrice, experience, workSampleUrl } = parsed.data;

  // Verify the course exists
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) {
    return NextResponse.json(
      { success: false, error: 'Course not found' },
      { status: 404 },
    );
  }

  try {
    const tutorCourse = await prisma.tutorCourse.create({
      data: {
        tutorId: auth.sub,
        courseId,
        customPrice,
        ...(experience ? { experience } : {}),
        ...(workSampleUrl ? { workSampleUrl } : {}),
      },
      include: { course: true },
    });

    return NextResponse.json({ success: true, tutorCourse }, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'COURSE_ALREADY_ADDED' },
        { status: 409 },
      );
    }
    throw error;
  }
}
