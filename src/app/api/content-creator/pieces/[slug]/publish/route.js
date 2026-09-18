/**
 * POST /api/content-creator/pieces/[slug]/publish
 * Body: { manifest, sizes: { [fileName]: bytes } }
 *
 * Finishes a publish after the files were uploaded with …/publish/uploads:
 * validates the manifest (same schema as the admin "Posts" page), checks the
 * files, removes leftovers of a previous publish and writes manifest.json.
 *
 * Auth: personal content-creator token. Audit-logged.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as pieceService from '@/lib/services/marketing-piece.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

export const POST = contentCreatorRoute('POST /api/content-creator/pieces/[slug]/publish', async ({ params, body, actor, request }) => {
  const result = await pieceService.publishPiece(params.slug, body, actor);
  await logAction({
    adminId: actor.sub,
    action: ADMIN_ACTIONS.MARKETING_POST_PUBLISH,
    targetType: 'MarketingPost',
    targetId: params.slug,
    payload: { title: body?.manifest?.title, format: body?.manifest?.format, files: result.files },
    request,
  });
  return ok({ publishedAt: result.publishedAt });
});
