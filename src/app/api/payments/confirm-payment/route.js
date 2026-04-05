/**
 * POST /api/payments/confirm-payment
 * Client-side payment confirmation (when Wompi widget callback returns APPROVED)
 * 
 * In production, the webhook (POST /api/payments/webhook) will be the primary method.
 * This endpoint is a fallback for cases where webhook is not immediately received,
 * or during development/testing when webhook may not be fired by Wompi.
 * 
 * Body:
 *   reference: string (Wompi transaction reference)
 *   transactionData: object (Wompi transaction object from widget callback)
 */

import * as WompiService from '@/lib/services/wompi.service';
import { authenticateRequest } from '@/lib/auth/middleware';

export async function POST(request) {
  try {
    // Verify authentication
    const user = await authenticateRequest(request);
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { reference, transactionData } = body;

    console.log('[POST /api/payments/confirm-payment] Request received:', {
      reference,
      transactionId: transactionData?.id,
      status: transactionData?.status,
      metadata: transactionData?.metadata,
    });

    if (!reference || !transactionData) {
      return Response.json(
        {
          success: false,
          error: 'Missing required fields: reference, transactionData',
        },
        { status: 400 }
      );
    }

    // Validate transaction is APPROVED
    if (transactionData.status !== 'APPROVED') {
      return Response.json(
        {
          success: false,
          error: `Transaction status is ${transactionData.status}, not APPROVED`,
        },
        { status: 400 }
      );
    }

    // Validate metadata exists
    if (!transactionData.metadata) {
      return Response.json(
        {
          success: false,
          error: 'Transaction metadata is missing',
        },
        { status: 400 }
      );
    }

    const { studentId, tutorId, courseId } = transactionData.metadata;
    if (!studentId || !tutorId || !courseId) {
      return Response.json(
        {
          success: false,
          error: 'Metadata is incomplete: missing studentId, tutorId, or courseId',
        },
        { status: 400 }
      );
    }

    // Verify student is the authenticated user (security check)
    if (user.sub !== parseInt(studentId, 10)) {
      return Response.json(
        { success: false, error: 'Cannot confirm payment for another student' },
        { status: 403 }
      );
    }

    console.log('[POST /api/payments/confirm-payment] Processing payment:', {
      reference,
      transactionId: transactionData.id,
      studentId,
      tutorId,
      courseId,
    });

    // Process successful payment (same as webhook)
    const result = await WompiService.processSuccessfulPayment(transactionData);

    console.log(
      `[POST /api/payments/confirm-payment] ✓ Payment confirmed: session=${result.session?.id}, payment=${result.payment?.id}, review=${result.review?.id}`
    );

    return Response.json(
      {
        success: true,
        message: 'Payment confirmed and session created',
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[POST /api/payments/confirm-payment] Error:', error.message, error.stack);
    return Response.json(
      {
        success: false,
        error: error.message || 'Failed to confirm payment',
      },
      { status: 500 }
    );
  }
}
