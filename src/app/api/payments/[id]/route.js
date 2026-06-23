/**
 * GET /api/payments/[id]      – Get payment details
 * PUT /api/payments/[id]      – Update payment status (tutor or admin)
 *   When status becomes 'paid', subtracts amount from tutor next_payment
 *   and adds it to total_earning.
 */

import { NextResponse } from 'next/server';
import * as paymentRepo from '@/lib/repositories/payment.repository';
import { authenticateRequest } from '@/lib/auth/middleware';
import { requireAdminUser } from '@/lib/auth/guards';

export async function GET(request, { params }) {
  try {
    // Verify authentication
    const user = await authenticateRequest(request);
    if (user instanceof NextResponse) return user;

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

    // Verify user is either the student or tutor (JWT identity lives in `sub`, not `id`)
    if (String(payment.studentId) !== String(user.sub) && String(payment.tutorId) !== String(user.sub)) {
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

export async function PUT(request, { params }) {
  try {
    // Changing a payment's financial status (and moving tutor earnings) is an
    // admin-only action — a tutor must never be able to self-approve their
    // own payouts. Re-checks role against the DB on every call.
    const admin = await requireAdminUser(request);
    if (admin instanceof NextResponse) return admin;

    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return Response.json({ success: false, error: 'Payment ID is required' }, { status: 400 });
    }

    const payment = await paymentRepo.findById(id);
    if (!payment) {
      return Response.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    const allowed = ['pending', 'paid', 'failed'];
    if (!status || !allowed.includes(status)) {
      return Response.json(
        { success: false, error: `Status must be one of: ${allowed.join(', ')}` },
        { status: 400 }
      );
    }

    // Prevent no-op double-transitions
    if (payment.status === status) {
      return Response.json({ success: true, payment }, { status: 200 });
    }

    const updated = await paymentRepo.updateStatus(id, status);

    // When manually marking a payment as paid, move the amount from
    // next_payment to total_earning in tutor_profiles.
    if (status === 'paid' && payment.status !== 'paid') {
      try {
        await paymentRepo.moveTutorPaymentToEarning(
          payment.tutorId,
          Number(payment.amount)
        );
      } catch (err) {
        console.error('[PUT /api/payments/[id]] Failed to update tutor earnings:', err.message);
      }
    }

    return Response.json({ success: true, payment: updated }, { status: 200 });
  } catch (error) {
    console.error('[PUT /api/payments/[id]]:', error.message);
    return Response.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
