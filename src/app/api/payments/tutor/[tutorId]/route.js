/**
 * GET /api/payments/tutor/[tutorId]
 * Retrieves all payments for a specific tutor
 */

import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { tutorId } = resolvedParams;

    if (!tutorId) {
      return Response.json({ error: 'Tutor ID is required' }, { status: 400 });
    }

    // Convert tutorId to number
    const tutorIdNum = parseInt(tutorId, 10);
    if (isNaN(tutorIdNum)) {
      return Response.json({ error: 'Invalid tutor ID format' }, { status: 400 });
    }

    // Fetch all payments for this tutor with student and course details
    const payments = await prisma.payment.findMany({
      where: {
        tutorId: tutorIdNum,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        session: {
          select: {
            id: true,
            course: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format response to match expected structure
    const formattedPayments = payments.map((p) => ({
      id: p.id,
      wompiTransactionId: p.wompiId,
      studentId: p.student?.id,
      studentName: p.student?.name,
      studentEmailAddress: p.student?.email,
      studentEmail: p.student?.email,
      courseId: p.session?.course?.id,
      course: p.session?.course?.name,
      amount: p.amount ? parseFloat(p.amount) : 0,
      status: p.status === 'completed' ? 'paid' : p.status || 'pending',
      pagado: p.status === 'completed',
      createdAt: p.createdAt,
      date_payment: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return Response.json(formattedPayments, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching tutor payments:', error);
    return Response.json(
      { error: error.message || 'Error fetching payments' },
      { status: 500 }
    );
  }
}
