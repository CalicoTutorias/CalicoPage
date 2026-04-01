/**
 * POST /api/auth/reset-password
 * Sets a new password using a magic link token from the URL.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import * as userService from '@/lib/services/user.service';
import * as userRepository from '@/lib/repositories/user.repository';
import { sendPasswordChangeConfirmation } from '@/lib/services/email.service';

const schema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(128),
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
