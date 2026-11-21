/**
 * /api/users/me/university-email — the caller's university email (the
 * "verified Uniandes" badge). See university-email.service.
 *
 * GET    → { status }  email, university, pendingEmail, resendAvailableAt
 * POST   { email } → sends the verification link; { status }
 * DELETE → removes the university email and the badge; { status }
 *
 * Auth: any logged-in user. Identity from the JWT only.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateRequest } from '@/lib/auth/middleware';
import { rateLimit, getClientIp } from '@/lib/auth/rateLimit';
import * as universityEmailService from '@/lib/services/university-email.service';

const bodySchema = z.object({ email: z.string().trim().min(3).max(254) }).strict();

const STATUS_BY_CODE = {
  INVALID_EMAIL: 400,
  DOMAIN_NOT_ALLOWED: 400,
  ALREADY_VERIFIED: 409,
  EMAIL_TAKEN: 409,
  COOLDOWN: 429,
  NOT_FOUND: 404,
  EMAIL_SEND_FAILED: 502,
};

function errorResponse(err, tag) {
  const status = STATUS_BY_CODE[err?.code];
  if (status) {
    const headers = err.retryAfterSeconds ? { 'Retry-After': String(err.retryAfterSeconds) } : undefined;
    return NextResponse.json(
      { success: false, error: err.message, code: err.code, ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}) },
      { status, headers },
    );
  }
  console.error(`[${tag}]:`, err?.message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const status = await universityEmailService.getStatus(auth.sub);
    return NextResponse.json({ success: true, status });
  } catch (err) {
    return errorResponse(err, 'GET /api/users/me/university-email');
  }
}

export async function POST(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  // Per instance; the DB cooldown in the service is what holds across instances.
  const limited = rateLimit(`university-email:${auth.sub}:${getClientIp(request)}`, { max: 5, windowMs: 15 * 60_000 });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Datos inválidos' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Escribe un correo válido', code: 'INVALID_EMAIL' }, { status: 400 });
  }

  try {
    const status = await universityEmailService.requestVerification(auth.sub, parsed.data.email);
    return NextResponse.json({ success: true, status });
  } catch (err) {
    return errorResponse(err, 'POST /api/users/me/university-email');
  }
}

export async function DELETE(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const status = await universityEmailService.remove(auth.sub);
    return NextResponse.json({ success: true, status });
  } catch (err) {
    return errorResponse(err, 'DELETE /api/users/me/university-email');
  }
}
