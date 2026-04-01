/**
 * POST /api/auth/verify-otp
 * Validates a one-time password sent via email during the password-reset flow.
 * On success, returns a short-lived resetToken that authorises the actual password change.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as userService from '@/lib/services/user.service';

const schema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6, 'OTP must be 6 digits'),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { email, otpCode } = parsed.data;
    const result = await userService.verifyOtp(email, otpCode);

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: 'OTP_INVALID' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      resetToken: result.resetToken,
    });
  } catch (error) {
    console.error('Error in POST /api/auth/verify-otp:', error);
    return NextResponse.json(
      { success: false, error: 'OTP verification failed' },
      { status: 500 },
    );
  }
}
