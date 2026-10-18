/**
 * /api/content-creator/plans/[key]
 *
 * GET — the plan with all its entries.
 * PUT — create the plan with all its entries (baseVersion 0, the import of a
 *       season) or update its header: title, dates, settings (409 when someone
 *       else saved since baseVersion). Entries are edited one by one afterwards.
 *
 * Auth: personal content-creator token. Creating a plan is audit-logged.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as planService from '@/lib/services/marketing-plan.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const TAG = '/api/content-creator/plans/[key]';

export const GET = contentCreatorRoute(`GET ${TAG}`, async ({ params }) =>
  ok({ plan: await planService.getPlan(params.key) }));

export const PUT = contentCreatorRoute(`PUT ${TAG}`, async ({ params, body, actor, request }) => {
  const result = await planService.savePlan(params.key, body, actor);
  if (result.created) {
    await logAction({
      adminId: actor.sub,
      action: ADMIN_ACTIONS.MARKETING_PLAN_CREATE,
      targetType: 'MarketingPlan',
      targetId: params.key,
      payload: { title: body.title, entries: result.entries },
      request,
    });
  }
  return ok({ key: result.key, version: result.version }, result.created ? 201 : 200);
});
