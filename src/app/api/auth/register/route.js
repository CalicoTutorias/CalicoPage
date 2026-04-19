/**
 * POST /api/auth/register
 * Creates a new user with hashed password, sends verification email,
 * and returns a JWT for immediate sign-in.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { signToken } from '@/lib/auth/jwt';
import * as userRepository from '@/lib/repositories/user.repository';
import * as userService from '@/lib/services/user.service';
import { sendVerificationEmail } from '@/lib/services/email.service';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  phoneNumber: z.string().max(20).optional().default(''),
  careerId: z.string().uuid().optional().nullable(),
  terms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions to register',
  }),
});

export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { name, email, password, phoneNumber, careerId, terms } = parsed.data;

    // 1. Check if email already exists
    const existing = await userRepository.findByEmailWithPassword(email);
    if (existing) {
      if (existing.isEmailVerified) {
        return NextResponse.json(
          { success: false, error: 'EMAIL_EXISTS' },
          { status: 409 },
        );
      }
      // Unverified account — regenerate token and resend email
      const verificationToken = await userService.createVerificationToken(existing.id);
      sendVerificationEmail(email, existing.name, verificationToken).catch((err) => {
        console.error('[Register] Failed to resend verification email:', err);
      });
      return NextResponse.json({ success: true, resent: true }, { status: 200 });
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 3. Create user in PostgreSQL
    const user = await userRepository.create({
      email,
      passwordHash,
      name,
      phoneNumber: phoneNumber || null,
      careerId: careerId || null,
      terms: terms === true,
    });

    // 4. Generate verification token & send email (fire-and-forget)
    const verificationToken = await userService.createVerificationToken(user.id);
    sendVerificationEmail(email, name, verificationToken).catch((err) => {
      console.error('[Register] Failed to send verification email:', err);
    });

    // 5. Sign JWT
    const token = signToken(user);

    return NextResponse.json({
      success: true,
      token,
      user,
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/auth/register:', error);
    return NextResponse.json(
      { success: false, error: 'Registration failed' },
      { status: 500 },
    );
  }
}
