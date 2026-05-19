/**
 * POST /api/auth/forgot-password
 * Generates a secure reset token and emails a magic link to the user.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as userService from '@/lib/services/user.service';
import { sendPasswordResetLink } from '@/lib/services/email.service';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request) {
  const limited = rateLimit(`forgot-pw:${getClientIp(request)}`, { max: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

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

    // Always return success to avoid revealing whether an email is registered
    // or verified (user enumeration prevention).
    if (!user || !user.isEmailVerified) {
      return NextResponse.json({ success: true });
    }

    const resetToken = await userService.createResetToken(user.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
    await sendPasswordResetLink(email, user.name || email, resetLink);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/forgot-password:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
