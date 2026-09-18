/**
 * POST /api/content-creator/pieces/[slug]/publish/uploads
 * Body: { files: [{ name, size }] } → presigned PUT URLs for the exported
 * PNGs (and the presentation PDF) under marketing-posts/{slug}/.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as pieceService from '@/lib/services/marketing-piece.service';

export const POST = contentCreatorRoute('POST /api/content-creator/pieces/[slug]/publish/uploads', async ({ params, body }) =>
  ok({ uploads: await pieceService.requestPublishUploads(params.slug, body) }));
