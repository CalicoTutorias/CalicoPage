/**
 * GET /api/health/db
 * Verifies database connectivity and connection pool health.
 *
 * Returns 200 { ok: true, latencyMs } on success, 503 { ok: false, error } on failure.
 */

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();
  try {
    // Quick ping to PostgreSQL
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - start;

    return NextResponse.json({ ok: true, latencyMs }, { status: 200 });
  } catch (err) {
    const latencyMs = Date.now() - start;
    const reason = err?.message || 'Database connection error';
    console.error('[GET /api/health/db]:', reason);

    Sentry.captureException(err, {
      level: 'error',
      tags: { domain: 'database', service: 'postgres-rds', operation: 'health-check' },
      extra: { latencyMs, reason },
    });

    return NextResponse.json({ ok: false, error: reason, latencyMs }, { status: 503 });
  }
}
