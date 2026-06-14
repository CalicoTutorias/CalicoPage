/**
 * POST /api/auth/register
 * Creates a new user with hashed password, sends verification email,
 * and returns a JWT for immediate sign-in.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import * as userRepository from '@/lib/repositories/user.repository';
import * as userService from '@/lib/services/user.service';
import { sendVerificationEmail } from '@/lib/services/email.service';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import { isValidPassword, sanitizeName } from '@/lib/utils/validation';

const PASSWORD_POLICY_MSG =
  'Password must be at least 12 characters, with one uppercase letter, one special character and no spaces';

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).transform(sanitizeName),
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128)
    .refine(isValidPassword, PASSWORD_POLICY_MSG),
  // Stored as "<dialCode> <local>" — allow only +, spaces and digits, and
  // require a sane digit count so junk / injection-ish payloads are rejected.
  phoneNumber: z
    .string()
    .max(20)
    .regex(/^[+\d\s]*$/, 'Invalid phone number')
    .refine((v) => {
      const d = v.replace(/\D/g, '');
      return d.length === 0 || (d.length >= 7 && d.length <= 18);
    }, 'Invalid phone number')
    .optional()
    .default(''),
  careerId: z.string().uuid().optional().nullable(),
  terms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions to register',
  }),
});

export async function POST(request) {
  const limited = rateLimit(`register:${getClientIp(request)}`, { max: 5, windowMs: 60 * 60_000 });
  if (limited) return limited;

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

    // 5. Do NOT issue a JWT here. A token is only granted via POST
    // /api/auth/login, which rejects accounts whose email is not yet
    // verified. This guarantees email verification is a hard gate for
    // obtaining any authenticated session — not just a frontend convention.
    return NextResponse.json({
      success: true,
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
