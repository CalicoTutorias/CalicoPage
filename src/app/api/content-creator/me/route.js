/**
 * GET /api/content-creator/me — who the token belongs to. The tool calls it to
 * check its configuration (`npm run piezas -- quien-soy`).
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';

export const GET = contentCreatorRoute('GET /api/content-creator/me', async ({ actor }) =>
  ok({ user: { name: actor.name, email: actor.email } }));
