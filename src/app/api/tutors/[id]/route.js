/**
 * GET /api/tutors/[id]
 * Retrieves tutor profile information including:
 *   - approved tutor courses (subjects[])
 *   - per-subject rating + review count (denormalized via Review.courseId)
 *   - aggregated profile stats
 *
 * Used primarily by the tutor detail page (/home/buscar-tutores/tutor/[tutorId]).
 */

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
          // Detail view should only surface courses the tutor is approved for.
          where: { status: 'Approved' },
          include: {
            course: {
              select: {
                id: true,
                name: true,
                code: true,
                basePrice: true,
                coursePrice: { select: { price: true } },
              },
            },
          },
        },
      },
    });

    if (!tutorProfile) {
      return Response.json({ error: 'Tutor not found' }, { status: 404 });
    }

    // Per-subject rating breakdown in a single grouped query.
    const courseIds = tutorProfile.tutorCourses.map((tc) => tc.course.id);
    const ratingByCourse = await reviewService.getRatingByCourseMap(tutorUserId, courseIds);

    // Overall rating: prefer the precomputed TutorProfile.review (kept in
    // sync by review.service via updateTutorReviewStats). Fallback to a live
    // aggregate if the precomputed value is 0 / null.
    let overallRating = parseFloat(tutorProfile.review) || 0;
    let overallCount = tutorProfile.numReview || 0;
    if (overallCount === 0) {
      const fallback = await reviewService.getReviewStats(tutorUserId);
      overallRating = fallback.average;
      overallCount = fallback.count;
    }

    const subjects = tutorProfile.tutorCourses.map((tc) => {
      const agg = ratingByCourse.get(tc.course.id) ?? { average: 0, count: 0 };
      // Centralized price (CoursePrice) takes precedence over basePrice.
      const price = tc.course.coursePrice?.price ?? tc.course.basePrice;
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

    const tutor = {
      success: true,
      tutor: {
        id: tutorProfile.userId,
        name: tutorProfile.user.name,
        email: tutorProfile.user.email,
        bio: tutorProfile.bio,
        profilePictureUrl: tutorProfile.user.profilePictureUrl,
        isTutorApproved: tutorProfile.user.isTutorApproved,
        rating: overallRating,
        numReview: overallCount,
        experience: tutorProfile.experienceYears,
        experienceDescription: tutorProfile.experienceDescription || null,
        credits: tutorProfile.credits,
        // Backwards-compatible: legacy callers read `courses` as a list of IDs.
        courses: courseIds,
        // New shape: rich per-subject info for the detail page.
        subjects,
        numSessions: tutorProfile.numSessions || 0,
        totalEarning: tutorProfile.totalEarning ? parseFloat(tutorProfile.totalEarning) : 0,
        nextPayment: tutorProfile.nextPayment ? parseFloat(tutorProfile.nextPayment) : 0,
      },
    };

    return Response.json(tutor);
  } catch (error) {
    console.error('Error fetching tutor:', error);
    return Response.json(
      { error: error.message || 'Error fetching tutor' },
      { status: 500 }
    );
  }
}
