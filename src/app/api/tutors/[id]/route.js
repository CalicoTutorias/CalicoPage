/**
 * GET /api/tutors/[id]
 * Retrieves tutor profile information including courses
 */

import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return Response.json({ error: 'Tutor ID is required' }, { status: 400 });
    }

    // Convert ID to number
    const tutorId = parseInt(id, 10);
    if (isNaN(tutorId)) {
      return Response.json({ error: 'Invalid tutor ID' }, { status: 400 });
    }

    // Fetch tutor profile with courses
    const tutorProfile = await prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
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
          include: {
            course: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!tutorProfile) {
      return Response.json({ error: 'Tutor not found' }, { status: 404 });
    }

    // Extract course IDs
    const courseIds = tutorProfile.tutorCourses.map((tc) => tc.course.id);

    // Calculate average rating from reviews
    const reviews = await prisma.review.findMany({
      where: {
        tutorId,
      },
      select: {
        rating: true,
      },
    });

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
      : 0;

    // Format response
    const tutor = {
      success: true,
      tutor: {
        id: tutorProfile.userId,
        name: tutorProfile.user.name,
        email: tutorProfile.user.email,
        bio: tutorProfile.bio,
        profilePictureUrl: tutorProfile.user.profilePictureUrl,
        isTutorApproved: tutorProfile.user.isTutorApproved,
        rating: parseFloat(tutorProfile.review) || avgRating,
        experience: tutorProfile.experienceYears,
        credits: tutorProfile.credits,
        courses: courseIds,
        numSessions: tutorProfile.numSessions || 0,
        totalEarning: tutorProfile.totalEarning ? parseFloat(tutorProfile.totalEarning) : 0,
        nextPayment: tutorProfile.nextPayment ? parseFloat(tutorProfile.nextPayment) : 0,
      },
    };

    console.log('[API] Tutor endpoint - returning rating:', tutor.tutor.rating, 'from tutorProfile.review:', tutorProfile.review);

    return Response.json(tutor);
  } catch (error) {
    console.error('Error fetching tutor:', error);
    return Response.json(
      { error: error.message || 'Error fetching tutor' },
      { status: 500 }
    );
  }
}
