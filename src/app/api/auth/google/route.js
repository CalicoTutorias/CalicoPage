/**
 * POST /api/auth/google
 * Verify Google ID token and create/login user
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { signToken } from '@/lib/auth/jwt';
import { verifyGoogleToken } from '@/lib/services/google-oauth.service';
import * as userRepository from '@/lib/repositories/user.repository';

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = googleAuthSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { idToken } = parsed.data;

    // 1. Verify Google token
    let googleUser;
    try {
      googleUser = await verifyGoogleToken(idToken);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid Google token' },
        { status: 401 },
      );
    }

    const { googleId, email, name, picture } = googleUser;

    // 2. Check if user exists by Google ID
    let user = await userRepository.findByGoogleIdWithPassword(googleId);

    if (user) {
      // Existing Google user - just log them in
      if (!user.isActive) {
        return NextResponse.json(
          { success: false, error: 'ACCOUNT_DISABLED' },
          { status: 403 },
        );
      }

      const token = signToken(user);
      const safeUser = await userRepository.findById(user.id);

      return NextResponse.json({
        success: true,
        token,
        user: safeUser,
      });
    }

    // 3. Check if user exists by email (account linking)
    const existingUser = await userRepository.findByEmailWithPassword(email);

    if (existingUser) {
      // Auto-link Google account to existing email account
      const updatedUser = await userRepository.update(existingUser.id, {
        googleId,
        authProvider: 'Google',
        profilePictureUrl: picture || existingUser.profilePictureUrl,
        isEmailVerified: true, // Google emails are pre-verified
      });

      const token = signToken(updatedUser);
      const safeUser = await userRepository.findById(updatedUser.id);

      return NextResponse.json({
        success: true,
        token,
        user: safeUser,
        linked: true, // Flag to inform client that accounts were linked
      });
    }

    // 4. Create new user from Google account
    const newUser = await userRepository.create({
      email,
      name,
      googleId,
      authProvider: 'Google',
      profilePictureUrl: picture,
      isEmailVerified: true, // Google emails are pre-verified
      passwordHash: null, // No password for OAuth users
    });

    const token = signToken(newUser);
    const safeUser = await userRepository.findById(newUser.id);

    return NextResponse.json({
      success: true,
      token,
      user: safeUser,
      isNewUser: true,
    });
  } catch (error) {
    console.error('Error in POST /api/auth/google:', error);
    return NextResponse.json(
      { success: false, error: 'Google authentication failed' },
      { status: 500 },
    );
  }
}
