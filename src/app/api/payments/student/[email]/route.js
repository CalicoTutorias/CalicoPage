/**
 * GET /api/payments/student/[email]
 * Get payment history for a student by email.
 *
 * Auth: Required. Returns a student's full financial history, so only that
 *       student (matched by the JWT's email) or an admin may read it. The
 *       requester identity comes from the JWT — never from the URL param.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth/middleware';
import { isAdmin } from '@/lib/auth/guards';

export async function GET(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const resolvedParams = await params;
    const { email } = resolvedParams;

    if (!email) {
      return Response.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Normalize to match how emails are stored/compared (lowercased at register).
    const normalizedEmail = decodeURIComponent(email).trim().toLowerCase();

    // Authorization: only the owner of this email, or an admin, may read it.
    if (
      String(auth.email ?? '').trim().toLowerCase() !== normalizedEmail &&
      !(await isAdmin(auth.sub))
    ) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
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
