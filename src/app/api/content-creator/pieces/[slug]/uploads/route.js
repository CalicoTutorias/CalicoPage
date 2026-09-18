/**
 * POST /api/content-creator/pieces/[slug]/uploads
 * Body: { files: [{ path, size }] } → presigned PUT URLs (15 min) for the
 * piece's source files (index.html, img/*). The size is signed into the URL.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as pieceService from '@/lib/services/marketing-piece.service';

export const POST = contentCreatorRoute('POST /api/content-creator/pieces/[slug]/uploads', async ({ params, body }) =>
  ok({ uploads: await pieceService.requestUploads(params.slug, body) }));
