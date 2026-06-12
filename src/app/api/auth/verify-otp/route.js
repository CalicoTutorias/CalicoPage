/**
 * POST /api/auth/verify-otp
 * Validates a one-time password sent via email during the password-reset flow.
 * On success, returns a short-lived resetToken that authorises the actual password change.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as userService from '@/lib/services/user.service';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  otpCode: z.string().length(6, 'OTP must be 6 digits'),
});

export async function POST(request) {
  // Per-IP limit first: blocks broad scanning before we touch the DB.
  const ipLimited = rateLimit(`otp-verify:ip:${getClientIp(request)}`, { max: 20, windowMs: 15 * 60_000 });
  if (ipLimited) return ipLimited;

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

    // Per-email limit: a 6-digit OTP is only ~1M combinations, so without this
    // an attacker who knows the victim's email could brute-force the code and
    // take over the account. Cap attempts per email to make that infeasible.
    const emailLimited = rateLimit(`otp-verify:email:${email}`, { max: 5, windowMs: 15 * 60_000 });
    if (emailLimited) return emailLimited;

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
