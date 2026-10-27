/**
 * GET /api/content-creator/plans — every plan de contenido (header only), newest first.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as planService from '@/lib/services/marketing-plan.service';

export const GET = contentCreatorRoute('GET /api/content-creator/plans', async () =>
  ok({ plans: await planService.listPlans() }));
