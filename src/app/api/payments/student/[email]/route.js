/**
 * GET /api/payments/student/me
 * Get payment history for the authenticated student.
 *
 * Auth: Required. The student identity comes from the JWT — the [email]
 * path parameter is ignored in the query to prevent IDOR attacks.
 * Only the authenticated user can see their own payments.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import prisma from '@/lib/prisma';

export async function GET(request) {
  // 1. Authenticate — identity from JWT only
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = String(auth.sub ?? '').trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch only this user's payments — never use the URL parameter
    const payments = await prisma.payment.findMany({
      where: { studentId: userId },
      include: {
        session: {
          include: {
            course: { select: { id: true, name: true } },
            tutor: { select: { id: true, name: true } },
          },
        },
        tutor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedPayments = payments.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      amount: parseFloat(p.amount),
      status: p.status,
      courseId: p.session?.courseId,
      course: p.session?.course?.name || 'Tutoría General',
      tutorId: p.tutorId,
      tutorName: p.tutor?.name || p.session?.tutor?.name || 'Tutor',
      date_payment: p.createdAt,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({ success: true, payments: formattedPayments });
  } catch (error) {
    console.error('[GET /api/payments/student] Error:', error.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
