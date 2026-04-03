/**
 * GET /api/payments/test-webhook
 * Testing endpoint for simulating a Wompi payment webhook
 * 
 * ONLY ENABLED IN DEVELOPMENT MODE
 * 
 * Query params:
 *   studentId: The student making the payment
 *   tutorId: The tutor receiving payment
 *   courseId: The course being booked
 *   amount: Amount in COP
 */

import * as WompiService from '@/lib/services/wompi.service';

export async function GET(request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { success: false, error: 'Test endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const studentId = parseInt(searchParams.get('studentId'), 10);
    const tutorId = parseInt(searchParams.get('tutorId'), 10);
    const courseId = searchParams.get('courseId');
    const amount = parseFloat(searchParams.get('amount') || '50000');

    if (!studentId || !tutorId || !courseId) {
      return Response.json(
        {
          success: false,
          error: 'Missing parameters: studentId, tutorId, courseId',
        },
        { status: 400 }
      );
    }

    // Simulate payment
    const now = new Date();
    const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour later

    const result = await WompiService.simulateWompiPayment(`test_${Date.now()}`, {
      studentId,
      tutorId,
      courseId,
      amount,
      durationMinutes: 60,
      startTimestamp: startTime.toISOString(),
      endTimestamp: endTime.toISOString(),
    });

    return Response.json(
      {
        success: true,
        message: 'Test payment simulated successfully',
        result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[GET /api/payments/test-webhook]:', error.message);
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
