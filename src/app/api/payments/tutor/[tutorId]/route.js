/**
 * GET /api/payments/tutor/[tutorId]
 * Get payment history for the authenticated tutor.
 *
 * Auth: Required. The tutor identity comes from the JWT — the [tutorId]
 * path parameter is ignored to prevent IDOR attacks.
 * Only the authenticated tutor can see their own payment records.
 * Admins may access any tutor's payments via the admin API.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import prisma from '@/lib/prisma';
import { paymentBreakdown } from '@/lib/payments/fees';

export async function GET(request) {
  // 1. Authenticate — identity from JWT only
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = String(auth.sub ?? '').trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch only this tutor's payments — never use the URL parameter
    const payments = await prisma.payment.findMany({
      where: { tutorId: userId },
      include: {
        student: { select: { id: true, name: true } },
        session: {
          select: {
            id: true,
            course: { select: { id: true, name: true } },
          },
        },
        coupon: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // `amount` is what the student was charged; `tutorPayoutBase` is what the
    // tutor's share is computed on (the list price when Calico absorbed a
    // coupon). The statistics page applies tutorPayout() to the base.
    const formattedPayments = payments.map((p) => {
      const breakdown = paymentBreakdown(p);
      return {
        id: p.id,
        courseId: p.session?.course?.id,
        course: p.session?.course?.name,
        studentId: p.student?.id,
        studentName: p.student?.name,
        amount: breakdown.amount,
        originalAmount: breakdown.originalAmount,
        discountAmount: breakdown.discountAmount,
        tutorPayoutBase: breakdown.tutorPayoutBase,
        tutorOwed: breakdown.tutorOwed,
        couponCode: p.coupon?.code ?? null,
        discountAbsorber: breakdown.discountAbsorber,
        status: p.status ?? 'pending',
        pagado: p.status === 'paid',
        tutorPayoutStatus: p.tutorPayoutStatus,
        createdAt: p.createdAt,
        date_payment: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return NextResponse.json(formattedPayments, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GET /api/payments/tutor] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
