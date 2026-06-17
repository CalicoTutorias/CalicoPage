/**
 * GET /api/tutors/[id]
 * Retrieves tutor profile information.
 *
 * Public callers receive a safe projection (no email, no financial data).
 * The authenticated tutor themselves (or an admin) receives the full profile
 * including totalEarning and nextPayment.
 */

import { NextResponse } from 'next/server';
import { tryAuthenticateRequest } from '@/lib/auth/middleware';
import prisma from '@/lib/prisma';
import * as reviewService from '@/lib/services/review.service';

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const tutorUserId = typeof id === 'string' ? id.trim() : String(id);
    if (!tutorUserId) {
      return Response.json({ error: 'Tutor ID is required' }, { status: 400 });
    }

    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: tutorUserId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profilePictureUrl: true,
            isTutorApproved: true,
          },
        },
        tutorCourses: {
          where: { status: 'Approved' },
          include: {
            course: {
              select: {
                id: true,
                name: true,
                code: true,
                basePrice: true,
              },
            },
          },
        },
      },
    });

    if (!tutorProfile) {
      return Response.json({ error: 'Tutor not found' }, { status: 404 });
    }

    const courseIds = tutorProfile.tutorCourses.map((tc) => tc.course.id);
    const ratingByCourse = await reviewService.getRatingByCourseMap(tutorUserId, courseIds);

    let overallRating = parseFloat(tutorProfile.review) || 0;
    let overallCount = tutorProfile.numReview || 0;
    if (overallCount === 0) {
      const fallback = await reviewService.getReviewStats(tutorUserId);
      overallRating = fallback.average;
      overallCount = fallback.count;
    }

    const subjects = tutorProfile.tutorCourses.map((tc) => {
      const agg = ratingByCourse.get(tc.course.id) ?? { average: 0, count: 0 };
      const price = tc.course.basePrice;
      return {
        courseId: tc.course.id,
        courseName: tc.course.name,
        courseCode: tc.course.code,
        price: price ? Number(price) : null,
        experience: tc.experience || null,
        workSampleUrl: tc.workSampleUrl || null,
        rating: Number(agg.average.toFixed(2)),
        reviewCount: agg.count,
      };
    });

    // Determine whether the caller can see sensitive financial/contact data
    const auth = tryAuthenticateRequest(request);
    const callerId = auth ? String(auth.sub ?? '') : null;
    const isAdmin = auth?.role === 'ADMIN';
    const isOwner = callerId && callerId === tutorUserId;
    const showSensitive = isOwner || isAdmin;

    const publicTutor = {
      id: tutorProfile.userId,
      name: tutorProfile.user.name,
      bio: tutorProfile.bio,
      profilePictureUrl: tutorProfile.user.profilePictureUrl,
      isTutorApproved: tutorProfile.user.isTutorApproved,
      rating: overallRating,
      numReview: overallCount,
      experience: tutorProfile.experienceYears,
      experienceDescription: tutorProfile.experienceDescription || null,
      credits: tutorProfile.credits,
      courses: courseIds,
      subjects,
      numSessions: tutorProfile.numSessions || 0,
    };

    if (showSensitive) {
      publicTutor.email = tutorProfile.user.email;
      publicTutor.totalEarning = tutorProfile.totalEarning
        ? parseFloat(tutorProfile.totalEarning)
        : 0;
      publicTutor.nextPayment = tutorProfile.nextPayment
        ? parseFloat(tutorProfile.nextPayment)
        : 0;
    }

    return NextResponse.json({ success: true, tutor: publicTutor });
  } catch (error) {
    console.error('[GET /api/tutors/:id] Error:', error.message);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
