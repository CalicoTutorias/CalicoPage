/**
 * PUT /api/sessions/:id/cancel — Cancel a session (student only)
 * Requires: reason, refundAmount
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import prisma from '@/lib/prisma';
import * as sessionRepo from '@/lib/repositories/session.repository';
import * as emailService from '@/lib/services/email.service';

export async function PUT(request, { params }) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  try {
    // Parse request body
    const body = await request.json();
    const { reason, refundAmount } = body;

    if (!reason || refundAmount === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: reason, refundAmount' },
        { status: 400 }
      );
    }

    // Fetch the session
    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Verify session is not already canceled or completed
    if (session.status === 'Canceled' || session.status === 'Completed') {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a ${session.status.toLowerCase()} session` },
        { status: 400 }
      );
    }

    // Verify user is a student in this session (not the tutor)
    const isStudent = session.participants.some(p => p.studentId === auth.sub);
    if (!isStudent) {
      return NextResponse.json(
        { success: false, error: 'Only students can cancel sessions' },
        { status: 403 }
      );
    }

    // Start transaction to update session, reviews, and payment
    const cancelledSession = await prisma.$transaction(async (tx) => {
      // 1. Update session with cancellation info
      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          status: 'Canceled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledBy: auth.sub,
          refundAmount: parseInt(refundAmount, 10),
        },
        include: {
          course: true,
          tutor: { select: { id: true, name: true, email: true } },
          participants: {
            include: {
              student: { select: { id: true, name: true, email: true } },
            },
          },
          payments: true,
          reviews: true,
          cancelledByUser: { select: { id: true, name: true, email: true } },
        },
      });

      // 2. Mark all pending reviews as Canceled
      await tx.review.updateMany({
        where: { sessionId, status: 'pending' },
        data: { status: 'Canceled' },
      });

      // 3. Update payment status to 'Canceled' with refund note
      if (updated.payments && updated.payments.length > 0) {
        const primaryPayment = updated.payments[0]; // Use first payment
        await tx.payment.update({
          where: { id: primaryPayment.id },
          data: {
            status: 'Canceled',
            notes: `Refund processed: ${refundAmount} COP. Reason: ${reason}`,
          },
        });
      }

      return updated;
    });

    // Get student data (first participant)
    const student = cancelledSession.participants?.[0]?.student;
    const tutor = cancelledSession.tutor;

    // Get original payment amount for admin email
    const originalPayment = cancelledSession.payments?.[0];
    const originalAmount = originalPayment?.amount ? Math.round(Number(originalPayment.amount)) : refundAmount;
    const deductionAmount = originalAmount - refundAmount;

    // Send emails (non-blocking - errors are logged but don't fail the response)
    try {
      // Email to student
      if (student?.email) {
        await emailService.sendSessionCancellationToStudent(
          student.email,
          student.name,
          cancelledSession,
          reason,
          { amount: refundAmount, deduction: deductionAmount, original: originalAmount }
        );
      }

      // Email to tutor
      if (tutor?.email) {
        await emailService.sendSessionCancellationToTutor(
          tutor.email,
          tutor.name,
          cancelledSession,
          reason
        );
      }

      // Email to Calico admin
      await emailService.sendSessionCancellationToAdmin(
        cancelledSession,
        reason,
        originalPayment,
        { amount: refundAmount, deduction: deductionAmount, original: originalAmount }
      );
    } catch (emailErr) {
      console.error('[Cancel Session] Email sending failed:', emailErr);
      // Don't fail the request if emails fail
    }

    return NextResponse.json({
      success: true,
      session: cancelledSession,
      refund: {
        amount: refundAmount,
        deduction: deductionAmount,
        original: originalAmount,
      },
    });
  } catch (error) {
    console.error('[Cancel Session] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to cancel session',
      },
      { status: 500 }
    );
  }
}
