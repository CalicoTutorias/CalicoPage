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
 *   attachments: { s3Key, fileName, fileSize, mimeType }[] (optional)
 *
 * Attachments are already uploaded to S3 (presigned PUT) by the client before
 * this call. Their metadata travels in the Wompi payment intent metadata so
 * that, once the payment is confirmed, bookPaidSession can register them
 * against the newly-created session. If this list is dropped here the files
 * stay orphaned in S3 and never show up on the session.
 */

import { NextResponse } from 'next/server';
import * as WompiService from '@/lib/services/wompi.service';
import { authenticateRequest } from '@/lib/auth/middleware';
import { resolveSessionAmount } from '@/lib/payments/pricing';

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

    // Parse request body. NOTE: any client-supplied `amount` is intentionally
    // ignored — the charge is computed server-side from the course's
    // centralized price × session length (see resolveSessionAmount below), so
    // the price is authoritative and cannot be tampered with from the browser.
    const body = await request.json();
    const {
      tutorId,
      courseId,
      startTimestamp,
      endTimestamp,
      topicsToReview,
      attachments,
    } = body;

    // Keep only the fields the registration step needs, capped at 5 files,
    // so we don't bloat the Wompi metadata with arbitrary client input.
    const sanitizedAttachments = Array.isArray(attachments)
      ? attachments
          .filter(
            (a) =>
              a &&
              typeof a.s3Key === 'string' &&
              typeof a.fileName === 'string' &&
              typeof a.mimeType === 'string',
          )
          .slice(0, 5)
          .map((a) => ({
            s3Key: a.s3Key,
            fileName: a.fileName,
            fileSize: Number(a.fileSize) || 0,
            mimeType: a.mimeType,
          }))
      : [];

    // Always use the authenticated user's ID as studentId — never trust user input
    const studentId = authenticatedStudentId;

    // Validate required fields (amount is derived server-side, not required here)
    if (!studentId || !tutorId || !courseId) {
      return Response.json(
        {
          success: false,
          error: 'Missing required fields: studentId, tutorId, courseId',
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

    // Authoritative price: course's centralized per-hour price × session length.
    // Computed from the server-validated timestamps; the client amount is unused.
    let amount;
    let durationMinutes;
    try {
      const priced = await resolveSessionAmount({
        courseId,
        startTimestamp: start,
        endTimestamp: end,
      });
      amount = priced.amount;
      durationMinutes = Math.round(priced.hours * 60);
    } catch (err) {
      if (err && err.name === 'PricingError') {
        const status = err.code === 'COURSE_NOT_FOUND' ? 404 : 400;
        return Response.json({ success: false, error: err.message }, { status });
      }
      throw err;
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
      attachments: sanitizedAttachments,
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
        error: 'Failed to create payment intent',
      },
      { status: 500 }
    );
  }
}
