/**
 * POST /api/payments/create-intent
 * Create a payment intent in Wompi for booking a tutoring session
 *
 * Body:
 *   studentId: number
 *   tutorId: number
 *   courseId: string (UUID)
 *   amount: number (COP)
 *   durationMinutes: number
 *   startTimestamp: ISO string
 *   endTimestamp: ISO string
 *   topicsToReview: string (required — what the student wants to review)
 *   attachments: [{ s3Key, fileName, fileSize, mimeType }] (optional — uploaded files metadata)
 */

import { NextResponse } from 'next/server';
import * as WompiService from '@/lib/services/wompi.service';
import { authenticateRequest } from '@/lib/auth/middleware';

export async function POST(request) {
  try {
    // Verify authentication
    const auth = authenticateRequest(request);
    if (auth instanceof Response || auth instanceof NextResponse) return auth;

    const authenticatedStudentId = String(auth.sub ?? '').trim();
    if (!authenticatedStudentId) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      tutorId,
      courseId,
      amount,
      durationMinutes,
      startTimestamp,
      endTimestamp,
      topicsToReview,
      attachments,
    } = body;

    // Always use the authenticated user's ID as studentId — never trust user input
    const studentId = authenticatedStudentId;

    // Validate required fields
    if (!studentId || !tutorId || !courseId || !amount) {
      return Response.json(
        {
          success: false,
          error: 'Missing required fields: studentId, tutorId, courseId, amount',
        },
        { status: 400 }
      );
    }

    // Validate topicsToReview (required, max 2000 chars)
    if (!topicsToReview || typeof topicsToReview !== 'string' || !topicsToReview.trim()) {
      return Response.json(
        { success: false, error: 'Debes describir qué temas quieres repasar (topicsToReview)' },
        { status: 400 },
      );
    }

    if (topicsToReview.length > 2000) {
      return Response.json(
        { success: false, error: 'La descripción de temas no puede exceder 2000 caracteres' },
        { status: 400 },
      );
    }

    // Validate timestamps
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return Response.json(
        { success: false, error: 'Invalid timestamps' },
        { status: 400 }
      );
    }

    if (start >= end) {
      return Response.json(
        { success: false, error: 'Start timestamp must be before end timestamp' },
        { status: 400 }
      );
    }

    // Create payment intent
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/payments/confirm`;
    const intent = await WompiService.createPaymentIntent({
      studentId,
      tutorId,
      courseId,
      amount,
      durationMinutes,
      startTimestamp: start,
      endTimestamp: end,
      redirectUrl,
      topicsToReview: topicsToReview.trim(),
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    return Response.json(
      {
        success: true,
        intent,
        checkoutUrl: intent.checkoutUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[POST /api/payments/create-intent]:', error.message);
    return Response.json(
      {
        success: false,
        error: error.message || 'Failed to create payment intent',
      },
      { status: 500 }
    );
  }
}
