/**
 * GET /api/content-creator/me — who the token belongs to. The tool calls it to
 * check its configuration (`npm run piezas -- quien-soy`) and reads
 * `capabilities` to know what this deployment accepts (e.g. 'video': edited
 * reels with their clips and MP4), so an older API never gets files it rejects.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';

export const GET = contentCreatorRoute('GET /api/content-creator/me', async ({ actor }) =>
  ok({ user: { name: actor.name, email: actor.email }, capabilities: ['video'] }));
