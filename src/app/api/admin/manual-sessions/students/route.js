/**
 * GET /api/admin/manual-sessions/students?q=
 * People whose email or name matches, for the search under the form's email
 * field. When `q` is someone's whole email, they come first, so the form can say
 * that this email is already registered.
 *
 * Auth: requireAdminUser.
 * Returns: { success: true, students: [{ name, external, phoneNumber, whatsappTag, email }] }
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminUser } from '@/lib/auth/guards';
import * as manualSessionService from '@/lib/services/manual-session.service';
import { invalidInput, manualSessionErrorResponse } from '../_shared';

const querySchema = z.string().trim().toLowerCase().min(3).max(254);

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const query = querySchema.safeParse(new URL(request.url).searchParams.get('q'));
  if (!query.success) return invalidInput('INVALID_QUERY');

  try {
    const students = await manualSessionService.searchStudents(query.data);
    return NextResponse.json({ success: true, students });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions/students');
  }
}
