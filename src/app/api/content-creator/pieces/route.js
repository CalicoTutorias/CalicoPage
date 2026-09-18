/**
 * GET /api/content-creator/pieces — every piece, most recently edited first.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as pieceService from '@/lib/services/marketing-piece.service';

export const GET = contentCreatorRoute('GET /api/content-creator/pieces', async () =>
  ok({ pieces: await pieceService.listPieces() }));
