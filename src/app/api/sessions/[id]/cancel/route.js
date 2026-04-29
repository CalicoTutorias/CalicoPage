/**
 * PUT /api/sessions/:id/cancel — Cancel a session
 * 
 * Student cancellation: reason, refundMethod required (refundMethodDetails optional for llave)
 * Tutor cancellation: reason required (refundMethod handled by student afterwards)
 * Returning student after tutor canceled: refundMethod required
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
    const body = await request.json();
    const { reason, refundMethod, refundMethodDetails } = body;

    const session = await sessionRepo.findById(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if already canceled or completed
    if (session.status === 'Canceled' || session.status === 'Completed') {
      return NextResponse.json(
        { success: false, error: `Cannot cancel a ${session.status.toLowerCase()} session` },
        { status: 400 }
      );
    }

    const isStudent = session.participants.some(p => p.studentId === auth.sub);
    const isTutor = session.tutorId === auth.sub;

    // Determine who is canceling
    let isTutorCancellation = false;
    if (isTutor) {
      isTutorCancellation = true;
    } else if (!isStudent) {
      return NextResponse.json(
        { success: false, error: 'Only students or tutors can cancel sessions' },
        { status: 403 }
      );
    }

    // === STUDENT CANCELLATION (original flow) ===
    if (isStudent && !isTutorCancellation) {
      if (!reason || !refundMethod) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: reason, refundMethod' },
          { status: 400 }
        );
      }

      if (refundMethod === 'llave' && !refundMethodDetails) {
        return NextResponse.json(
          { success: false, error: 'Llave requires payment details' },
          { status: 400 }
        );
      }

      // Verify session can be canceled (not within 6 hours)
      const now = new Date();
      const sessionDate = new Date(session.startTimestamp);
      const hoursUntilSession = (sessionDate - now) / (1000 * 60 * 60);
      
      if (hoursUntilSession < 6) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Sessions must be canceled at least 6 hours in advance. Time remaining: ${hoursUntilSession.toFixed(1)} hours.`,
            code: 'CANCELLATION_DEADLINE_PASSED'
          },
          { status: 400 }
        );
      }

      const cancelledSession = await prisma.$transaction(async (tx) => {
        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            status: 'Canceled',
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledBy: auth.sub,
            refundMethod: refundMethod,
            refundMethodDetails: refundMethodDetails || null,
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

        return updated;
      });

      const student = cancelledSession.participants?.[0]?.student;
      const tutor = cancelledSession.tutor;
      const originalPayment = cancelledSession.payments?.[0];
      const originalAmount = originalPayment?.amount ? Math.round(Number(originalPayment.amount)) : 0;

      try {
        if (student?.email) {
          await emailService.sendSessionCancellationToStudent(
            student.email,
            student.name,
            cancelledSession,
            reason,
            refundMethod,
            refundMethodDetails
          );
        }

        if (tutor?.email) {
          await emailService.sendSessionCancellationToTutor(
            tutor.email,
            tutor.name,
            cancelledSession,
            reason
          );
        }

        await emailService.sendSessionCancellationToAdmin(
          cancelledSession,
          reason,
          originalPayment,
          originalAmount,
          refundMethod,
          refundMethodDetails
        );
      } catch (emailErr) {
        console.error('[Cancel Session] Email sending failed:', emailErr);
      }

      return NextResponse.json({
        success: true,
        session: cancelledSession,
        refund: {
          original: originalAmount,
          method: refundMethod,
        },
      });
    }

    // === TUTOR CANCELLATION ===
    if (isTutorCancellation) {
      if (!reason) {
        return NextResponse.json(
          { success: false, error: 'Missing required field: reason' },
          { status: 400 }
        );
      }

      // Same 6-hour restriction for tutors
      const now = new Date();
      const sessionDate = new Date(session.startTimestamp);
      const hoursUntilSession = (sessionDate - now) / (1000 * 60 * 60);
      
      if (hoursUntilSession < 6) {
        return NextResponse.json(
          { 
            success: false, 
            error: `Sessions must be canceled at least 6 hours in advance. Time remaining: ${hoursUntilSession.toFixed(1)} hours.`,
            code: 'CANCELLATION_DEADLINE_PASSED'
          },
          { status: 400 }
        );
      }
      const cancelledSession = await prisma.$transaction(async (tx) => {
        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            status: 'Canceled',
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledBy: auth.sub,
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

        return updated;
      });

      const student = cancelledSession.participants?.[0]?.student;
      const tutor = cancelledSession.tutor;

      try {
        if (student?.email) {
          await emailService.sendSessionCancellationToStudent(
            student.email,
            student.name,
            cancelledSession,
            reason,
            null,
            null,
            true // tutorCancelled flag
          );
        }

        if (tutor?.email) {
          await emailService.sendSessionCancellationToTutor(
            tutor.email,
            tutor.name,
            cancelledSession,
            reason
          );
        }
      } catch (emailErr) {
        console.error('[Cancel Session] Email sending failed:', emailErr);
      }

      return NextResponse.json({
        success: true,
        session: cancelledSession,
        waitingForRefund: true,
      });
    }

    // === STUDENT PROVIDING REFUND AFTER TUTOR CANCELED ===
    if (isStudent && session.status === 'Canceled' && session.cancelledBy !== auth.sub && !session.refundMethod) {
      if (!refundMethod) {
        return NextResponse.json(
          { success: false, error: 'Refund method required' },
          { status: 400 }
        );
      }

      if (refundMethod === 'llave' && !refundMethodDetails) {
        return NextResponse.json(
          { success: false, error: 'Llave requires payment details' },
          { status: 400 }
        );
      }

      const updatedSession = await prisma.$transaction(async (tx) => {
        const updated = await tx.session.update({
          where: { id: sessionId },
          data: {
            refundMethod: refundMethod,
            refundMethodDetails: refundMethodDetails || null,
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

        return updated;
      });

      const student = updatedSession.participants?.[0]?.student;
      const tutor = updatedSession.tutor;
      const originalPayment = updatedSession.payments?.[0];
      const originalAmount = originalPayment?.amount ? Math.round(Number(originalPayment.amount)) : 0;

      try {
        await emailService.sendSessionCancellationToAdmin(
          updatedSession,
          updatedSession.cancellationReason,
          originalPayment,
          originalAmount,
          refundMethod,
          refundMethodDetails
        );
      } catch (emailErr) {
        console.error('[Cancel Session] Email sending failed:', emailErr);
      }

      return NextResponse.json({
        success: true,
        session: updatedSession,
        refund: {
          original: originalAmount,
          method: refundMethod,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid cancellation request' },
      { status: 400 }
    );
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
