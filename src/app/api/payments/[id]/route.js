/**
 * GET /api/payments/[id]
 * Get payment details by payment ID
 */

import * as paymentRepo from '@/lib/repositories/payment.repository';
import { authenticateRequest } from '@/lib/auth/middleware';

export async function GET(request, { params }) {
  try {
    // Verify authentication
    const user = await authenticateRequest(request);
    if (!user) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return Response.json(
        { success: false, error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // Fetch payment
    const payment = await paymentRepo.findById(parseInt(id, 10));
    if (!payment) {
      return Response.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Verify user is either the student or tutor
    if (payment.studentId !== user.id && payment.tutorId !== user.id) {
      return Response.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    return Response.json(
      {
        success: true,
        payment,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[GET /api/payments/[id]]:', error.message);
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
