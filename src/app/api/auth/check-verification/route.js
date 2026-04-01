/**
 * GET /api/auth/check-verification?email=XXX
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import * as userService from '@/lib/services/user.service';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }
    const { exists, isEmailVerified } = await userService.getVerificationStatus(email);
    return NextResponse.json({ success: true, isEmailVerified: exists ? isEmailVerified : false });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Verification check failed' }, { status: 500 });
  }
}
