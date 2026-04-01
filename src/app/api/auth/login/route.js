/**
 * POST /api/auth/login
 * Verifies email + password against PostgreSQL, returns JWT on success.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { signToken } from '@/lib/auth/jwt';
import * as userRepository from '@/lib/repositories/user.repository';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;

    // 1. Find user by email (with password hash for comparison)
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    // 2. Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'INVALID_CREDENTIALS' },
        { status: 401 },
      );
    }

    // 3. Check account status
    if (!user.isActive) {
      return NextResponse.json(
        { success: false, error: 'ACCOUNT_DISABLED' },
        { status: 403 },
      );
    }

    if (!user.isEmailVerified) {
      return NextResponse.json(
        { success: false, error: 'EMAIL_NOT_VERIFIED', email: user.email },
        { status: 403 },
      );
    }

    // 4. Sign JWT and return (strip sensitive fields from response)
    const token = signToken(user);

    const { passwordHash, verificationToken, resetToken, resetTokenExpiry, otpCode, otpCodeExpiry, ...safeUser } = user;

    return NextResponse.json({
      success: true,
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 },
    );
  }
}
