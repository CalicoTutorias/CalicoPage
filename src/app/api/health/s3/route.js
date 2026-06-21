/**
 * GET /api/health/s3
 * Verifies S3 credentials + bucket access by issuing a HeadBucket.
 * Auth required so we don't leak infra signals publicly.
 *
 * Returns 200 { ok, bucket, region } on success, 503 with { ok: false, error } on failure.
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import { healthCheck } from '@/lib/s3';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await healthCheck();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (err) {
    const reason =
      err?.name === 'NoSuchBucket'
        ? 'Bucket does not exist'
        : err?.Code === 'AccessDenied' || err?.name === 'AccessDenied'
          ? 'Access denied — check AWS credentials or bucket policy'
          : err?.message || 'S3 connectivity error';

    console.error('[GET /api/health/s3]:', reason);
    return NextResponse.json({ ok: false, error: reason }, { status: 503 });
  }
}
