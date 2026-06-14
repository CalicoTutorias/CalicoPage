/**
 * POST /api/auth/reset-password
 * Sets a new password using a magic link token from the URL.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import * as userService from '@/lib/services/user.service';
import * as userRepository from '@/lib/repositories/user.repository';
import { bumpTokenVersion } from '@/lib/services/user.service';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { sendPasswordChangeConfirmation } from '@/lib/services/email.service';
import { isValidPassword } from '@/lib/utils/validation';

const PASSWORD_POLICY_MSG =
  'Password must be at least 12 characters, with one uppercase letter, one special character and no spaces';

const schema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .refine(isValidPassword, PASSWORD_POLICY_MSG),
});

export async function POST(request) {
  // 10 attempts / 15 min per IP — tokens are one-time-use but throttle discourages spray
  const limited = rateLimit(`reset-pwd:${getClientIp(request)}`, { max: 10, windowMs: 15 * 60_000 });
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { token, newPassword } = parsed.data;

    const user = await userService.validateResetToken(token);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'RESET_TOKEN_INVALID' },
        { status: 401 },
      );
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await userRepository.update(user.id, { passwordHash: newHash });
    await userService.clearResetFields(user.id);
    await bumpTokenVersion(user.id);

    sendPasswordChangeConfirmation(user.email, user.name || user.email).catch((err) => {
      console.error('[ResetPassword] Failed to send confirmation email:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/reset-password:', error);
    return NextResponse.json(
      { success: false, error: 'Password reset failed' },
      { status: 500 },
    );
  }
}
