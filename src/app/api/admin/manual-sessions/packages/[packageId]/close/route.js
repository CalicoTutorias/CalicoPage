/**
 * POST /api/admin/manual-sessions/packages/:packageId/close
 *   Close a package: no more sessions can use it. Records the hours taken and
 *   what the student owes back when they fall into a lower tier.
 *
 * Auth: requireAdminUser.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth/guards';
import * as packageService from '@/lib/services/session-package.service';
import { invalidInput, manualSessionErrorResponse, uuidSchema } from '../../../_shared';

export async function POST(request, { params }) {
  const auth = await requireAdminUser(request);
  if (auth instanceof NextResponse) return auth;

  const { packageId } = await params;
  if (!uuidSchema.safeParse(packageId).success) return invalidInput();

  try {
    const pkg = await packageService.closePackage({ adminId: auth.sub, id: packageId, request });
    return NextResponse.json({ success: true, package: pkg });
  } catch (err) {
    return manualSessionErrorResponse(err, 'POST /api/admin/manual-sessions/packages/:id/close');
  }
}
