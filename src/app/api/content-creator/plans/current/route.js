/**
 * GET /api/content-creator/plans/current — the plan running today (or the next
 * one), with all its entries. 404 when there is no plan yet.
 *
 * Auth: personal content-creator token.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as planService from '@/lib/services/marketing-plan.service';

export const GET = contentCreatorRoute('GET /api/content-creator/plans/current', async () =>
  ok({ plan: await planService.getCurrentPlan() }));
