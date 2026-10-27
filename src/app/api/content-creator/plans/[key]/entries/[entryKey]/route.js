/**
 * /api/content-creator/plans/[key]/entries/[entryKey]
 *
 * PUT    — create (baseVersion 0) or replace an entry: date, format, title,
 *          brief, details, skipped. Send every field (it replaces the entry);
 *          409 when someone else changed it since baseVersion.
 * DELETE — remove the entry. The piece born from it (if any) stays.
 *
 * Auth: personal content-creator token. Deleting is audit-logged.
 */

import { contentCreatorRoute, ok } from '@/lib/http/content-creator-route';
import * as planService from '@/lib/services/marketing-plan.service';
import { logAction, ADMIN_ACTIONS } from '@/lib/services/admin-audit.service';

const TAG = '/api/content-creator/plans/[key]/entries/[entryKey]';

export const PUT = contentCreatorRoute(`PUT ${TAG}`, async ({ params, body, actor }) => {
  const result = await planService.saveEntry(params.key, params.entryKey, body, actor);
  return ok({ key: result.key, version: result.version }, result.created ? 201 : 200);
});

export const DELETE = contentCreatorRoute(`DELETE ${TAG}`, async ({ params, actor, request }) => {
  const result = await planService.deleteEntry(params.key, params.entryKey);
  await logAction({
    adminId: actor.sub,
    action: ADMIN_ACTIONS.MARKETING_PLAN_ENTRY_DELETE,
    targetType: 'MarketingPlanEntry',
    targetId: params.entryKey,
    payload: { plan: params.key, title: result.title },
    request,
  });
  return ok({});
});
