/**
 * POST /api/auth/resend-verification
 * Re-generates a verification token and re-sends the verification email.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as userService from '@/lib/services/user.service';
import { sendVerificationEmail } from '@/lib/services/email.service';

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
      // Don't reveal whether the email exists — always return success
      return NextResponse.json({ success: true });
    }

    if (user.isEmailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    const token = await userService.createVerificationToken(user.id);

    await sendVerificationEmail(email, user.name || email, token);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/resend-verification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to resend verification email' },
      { status: 500 },
    );
  }
}
