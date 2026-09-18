/**
 * /api/content-creator/pieces/[slug]
 *
 * GET    — piece with caption, meta and a presigned download URL per source file.
 * PUT    — create (baseVersion 0) or update the piece. Upload the files first
 *          (POST …/uploads); 409 when someone else saved since baseVersion.
 * DELETE — remove the piece source (row + S3). The published post stays.
 *
 * Auth: personal content-creator token. Create and delete are audit-logged.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as pieceService from '@/lib/services/marketing-piece.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const TAG = '/api/content-creator/pieces/[slug]';

export const GET = contentCreatorRoute(`GET ${TAG}`, async ({ params }) =>
  ok({ piece: await pieceService.getPiece(params.slug) }));

export const PUT = contentCreatorRoute(`PUT ${TAG}`, async ({ params, body, actor, request }) => {
  const result = await pieceService.savePiece(params.slug, body, actor);
  if (result.created) {
    await logAction({
      adminId: actor.sub,
      action: ADMIN_ACTIONS.MARKETING_PIECE_CREATE,
      targetType: 'MarketingPiece',
      targetId: params.slug,
      payload: { title: body.title, type: body.type },
      request,
    });
  }
  return ok({ slug: result.slug, version: result.version }, result.created ? 201 : 200);
});

export const DELETE = contentCreatorRoute(`DELETE ${TAG}`, async ({ params, actor, request }) => {
  const result = await pieceService.deletePiece(params.slug);
  await logAction({
    adminId: actor.sub,
    action: ADMIN_ACTIONS.MARKETING_PIECE_DELETE,
    targetType: 'MarketingPiece',
    targetId: params.slug,
    payload: { title: result.title },
    request,
  });
  return ok({});
});
