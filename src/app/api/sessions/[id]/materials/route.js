/**
 * GET  /api/sessions/:id/materials  The session's material for the caller. The
 *   student gets the list only after leaving a review with a comment; before that,
 *   only how many files there are. No URLs here: see ./[materialId]/download.
 * POST /api/sessions/:id/materials  Register a file uploaded with ./presigned-url.
 *
 * Auth: authenticateRequest; the service allows the session's tutor and admins to
 * manage it, and its student to read it. The user is always auth.sub. 30 calls/min.
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as sessionMaterialService from '@/lib/services/session-material.service';
import { authenticateActor, invalidInput, materialErrorResponse, readJson, uuidSchema } from './_shared';

const registerSchema = z.object({
  s3Key: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
});

export async function GET(request, { params }) {
  const actor = await authenticateActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return invalidInput();

  try {
    const result = await sessionMaterialService.listMaterials({ sessionId: id, actor });
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return materialErrorResponse(err, 'GET /api/sessions/[id]/materials');
  }
}

export async function POST(request, { params }) {
  const actor = await authenticateActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const parsed = registerSchema.safeParse(await readJson(request));
  if (!uuidSchema.safeParse(id).success || !parsed.success) return invalidInput();

  try {
    const material = await sessionMaterialService.registerMaterial({ sessionId: id, actor, ...parsed.data, request });
    return NextResponse.json({ success: true, material }, { status: 201 });
  } catch (err) {
    return materialErrorResponse(err, 'POST /api/sessions/[id]/materials');
  }
}
