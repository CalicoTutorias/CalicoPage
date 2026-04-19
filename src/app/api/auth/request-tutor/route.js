/**
 * POST /api/auth/request-tutor
 * Protected endpoint — requires valid JWT.
 * Creates a TutorProfile with the institutional email and sets isTutorRequested = true.
 * Uses a Prisma transaction to ensure atomicity.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { authenticateRequest } from '@/lib/auth/middleware';

const requestTutorSchema = z.object({
  schoolEmail: z
    .string()
    .email('Invalid institutional email')
    .regex(
      /@.co$/i,
      'Must be a valid @.co email',
    ),
});

export async function POST(request) {
  try {
    // 1. Authenticate
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    const userId = auth.sub;

    // 2. Validate body
    const body = await request.json();
    const parsed = requestTutorSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { schoolEmail } = parsed.data;

    // 3. Check if user already requested or is already a tutor
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    if (user.isTutorApproved) {
      return NextResponse.json(
        { success: false, error: 'ALREADY_TUTOR' },
        { status: 409 },
      );
    }

    if (user.isTutorRequested) {
      return NextResponse.json(
        { success: false, error: 'TUTOR_REQUEST_PENDING' },
        { status: 409 },
      );
    }

    // 4. Create TutorProfile + update user in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.tutorProfile.create({
        data: {
          userId,
          schoolEmail,
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { isTutorRequested: true },
        include: { tutorProfile: true },
      });

      return updatedUser;
    });

    // Strip sensitive fields
    const { passwordHash, verificationToken, resetToken, resetTokenExpiry, otpCode, otpCodeExpiry, ...safeUser } = result;

    return NextResponse.json({
      success: true,
      user: safeUser,
    }, { status: 201 });
  } catch (error) {
    // Handle unique constraint violation on school_email
    if (error.code === 'P2002' && error.meta?.target?.includes('school_email')) {
      return NextResponse.json(
        { success: false, error: 'SCHOOL_EMAIL_IN_USE' },
        { status: 409 },
      );
    }

    console.error('Error in POST /api/auth/request-tutor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit tutor request' },
      { status: 500 },
    );
  }
}
