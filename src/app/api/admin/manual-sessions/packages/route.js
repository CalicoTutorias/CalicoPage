/**
 * GET /api/admin/manual-sessions/packages  Every hours package (active first)
 *   with its hours used, hours left and what the student would owe back if it
 *   closed today. Packages are created from POST /api/admin/manual-sessions
 *   (`newPackageHours`) together with their first session.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as packageService from '@/lib/services/session-package.service';
import { manualSessionErrorResponse } from '../_shared';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const packages = await packageService.listPackages();
    return NextResponse.json({ success: true, packages });
  } catch (err) {
    return manualSessionErrorResponse(err, 'GET /api/admin/manual-sessions/packages');
  }
}
