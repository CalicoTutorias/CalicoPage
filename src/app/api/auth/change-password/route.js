/**
 * POST /api/auth/change-password
 * Allows an authenticated user to change their password.
 * Requires Bearer JWT + current password for re-authentication.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { authenticateRequest } from '@/lib/auth/middleware';
import * as userRepository from '@/lib/repositories/user.repository';
import { sendPasswordChangeConfirmation } from '@/lib/services/email.service';

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(128),
});

export async function POST(request) {
  try {
    // 1. Authenticate via JWT
    const auth = authenticateRequest(request);
    if (auth instanceof NextResponse) return auth;

    // 2. Validate body
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const userId = auth.sub;

    // 3. Re-authenticate: verify current password
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'CURRENT_PASSWORD_INCORRECT' },
        { status: 401 },
      );
    }

    // 4. Hash new password and update in PostgreSQL
    const newHash = await bcrypt.hash(newPassword, 10);
    await userRepository.update(userId, { passwordHash: newHash });

    // 5. Send confirmation email (fire-and-forget)
    sendPasswordChangeConfirmation(user.email, user.name || user.email).catch((err) => {
      console.error('[ChangePassword] Failed to send confirmation email:', err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/auth/change-password:', error);
    return NextResponse.json(
      { success: false, error: 'Password change failed' },
      { status: 500 },
    );
  }
}
