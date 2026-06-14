/**
 * GET /api/payments/tutor/[tutorId]
 * Retrieves all payments for a specific tutor.
 *
 * Auth: Required. Returns confidential data (student names + emails, amounts),
 *       so only the tutor themselves or an admin may read it. The requester
 *       identity comes from the JWT — never from the URL.
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
    const { tutorId } = resolvedParams;

    const tutorIdStr = String(tutorId ?? '').trim();
    if (!tutorIdStr) {
      return Response.json({ error: 'Tutor ID is required' }, { status: 400 });
    }

    // Authorization: only the tutor themselves, or an admin, may read these payments.
    if (String(auth.sub) !== tutorIdStr && !(await isAdmin(auth.sub))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Payment.tutorId matches User.id (String — UUID or legacy string id)
    const payments = await prisma.payment.findMany({
      where: {
        tutorId: tutorIdStr,
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
      status: p.status ?? 'pending',
      pagado: p.status === 'paid',
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
