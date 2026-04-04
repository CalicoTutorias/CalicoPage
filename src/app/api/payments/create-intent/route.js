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

    // Parse request body
    const body = await request.json();
    const {
      studentId,
      tutorId,
      courseId,
      amount,
      durationMinutes,
      startTimestamp,
      endTimestamp,
    } = body;

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

    // Verify student is the authenticated user (security check)
    if (user.sub !== studentId) {
      return Response.json(
        { success: false, error: 'Cannot create payment intent for another student' },
        { status: 403 }
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
    });
    console.log("ESTAMOS EN INTENT")

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
