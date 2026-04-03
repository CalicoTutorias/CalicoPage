/**
 * POST /api/auth/forgot-password
 * Generates a secure reset token and emails a magic link to the user.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as userService from '@/lib/services/user.service';
import { sendPasswordResetLink } from '@/lib/services/email.service';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid email' },
        { status: 400 },
      );
    }

    const { email } = parsed.data;
    const user = await userService.getUserByEmail(email);

    if (!user) {
      console.log('User not found');
      // Don't reveal whether the account exists
      return NextResponse.json({ success: true });
    }

    if (!user.isEmailVerified) {
      console.log('User not verified');
      return NextResponse.json(
        { success: false, error: 'EMAIL_NOT_VERIFIED', email },
        { status: 403 },
      );
    }

    const resetToken = await userService.createResetToken(user.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
    console.log('Reset link:', resetLink);
    await sendPasswordResetLink(email, user.name || email, resetLink);
    console.log('Password reset link sent');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/forgot-password:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
