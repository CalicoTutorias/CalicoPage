/**
 * DELETE /api/tutor/courses/:courseId — Remove a course from the tutor's catalog
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireTutor } from '@/lib/auth/guards';

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
