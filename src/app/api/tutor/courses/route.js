/**
 * GET  /api/tutor/courses — List tutor's courses with status and centralized price
 * POST /api/tutor/courses — Request approval for one or more new courses (status: Pending)
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';
import { requestCourses } from '@/lib/services/academic.service';

const courseEntrySchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  experience: z.string().optional(),
  workSampleUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

const requestCoursesSchema = z.object({
  courses: z.array(courseEntrySchema).min(1, 'Select at least one course'),
});

export async function GET(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  const where = { tutorId: auth.sub };
  if (status) where.status = status;

  const tutorCourses = await prisma.tutorCourse.findMany({
    where,
    include: { course: { include: { coursePrice: true } } },
  });

  return NextResponse.json({ success: true, courses: tutorCourses });
}

export async function POST(request) {
  const auth = requireTutor(request);
  if (auth instanceof NextResponse) return auth;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = requestCoursesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { courses } = parsed.data;
  const courseIds = courses.map((c) => c.courseId);

  // Verify all requested courses exist
  const existing = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true },
  });
  if (existing.length !== courseIds.length) {
    return NextResponse.json({ success: false, error: 'One or more courses not found' }, { status: 404 });
  }

  // Reject if any course is already in the tutor's catalog (any status)
  const alreadyLinked = await prisma.tutorCourse.findMany({
    where: { tutorId: auth.sub, courseId: { in: courseIds } },
    select: { courseId: true },
  });
  if (alreadyLinked.length > 0) {
    return NextResponse.json(
      { success: false, error: 'COURSE_ALREADY_ADDED', courseIds: alreadyLinked.map((tc) => tc.courseId) },
      { status: 409 },
    );
  }

  await prisma.tutorProfile.upsert({
    where: { userId: auth.sub },
    create: { userId: auth.sub, schoolEmail: auth.email },
    update: {},
  });

  try {
    const tutorCourses = await requestCourses(auth.sub, courses, true);
    return NextResponse.json({ success: true, courses: tutorCourses }, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'COURSE_ALREADY_ADDED' }, { status: 409 });
    }
    throw error;
  }
}
