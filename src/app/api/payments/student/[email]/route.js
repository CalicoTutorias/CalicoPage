/**
 * GET /api/payments/student/[email]
 * Get payment history for a student by email
 */

import prisma from '@/lib/prisma';

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const { email } = resolvedParams;

    if (!email) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return Response.json(
        { payments: [] },
        { status: 200 }
      );
    }

    // Get all payments for this student
    const payments = await prisma.payment.findMany({
      where: { studentId: user.id },
      include: {
        session: {
          include: {
            course: true,
            tutor: { select: { id: true, name: true, email: true } },
          },
        },
        tutor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format payments response
    const formattedPayments = payments.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      amount: parseFloat(p.amount),
      status: p.status,
      wompiId: p.wompiId,
      courseId: p.session?.courseId,
      course: p.session?.course?.name || 'Tutoría General',
      tutorId: p.tutorId,
      tutorName: p.tutor?.name || p.session?.tutor?.name || 'Tutor',
      date_payment: p.createdAt,
      createdAt: p.createdAt,
    }));

    return Response.json(
      { success: true, payments: formattedPayments },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching payments:', error);
    return Response.json(
      { error: 'Failed to fetch payments', details: error.message },
      { status: 500 }
    );
  }
}
