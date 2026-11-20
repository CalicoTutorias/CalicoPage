/**
 * Batch discount ("tutorías en bloque") — config read/write.
 *
 * Reads are cached in-process for a short time: every checkout quote reads
 * the config, and admins change it rarely. A write drops the cache of the
 * instance that served it; other instances pick it up within CACHE_MS.
 */

import * as batchRepo from '../repositories/batch-discount.repository';
import * as auditService from './admin-audit.service';
import { ADMIN_ACTIONS } from './admin-audit.service';
import {
  BATCH_ABSORBERS,
  normalizeBatchConfig,
  validateTiers,
} from '../payments/batch-discount';

const CACHE_MS = 30_000;
let cache = null; // { value, at }

export class BatchDiscountError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BatchDiscountError';
    this.code = code;
  }
}

/** Normalised config ({ isActive, tiers, absorber, stacksWithCoupons, appliesToManual }). */
export async function getConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await batchRepo.findConfig();
  const value = normalizeBatchConfig(row);
  cache = { value, at: Date.now() };
  return value;
}

/** Config for the admin page, with who/when it was last changed. */
export async function getConfigForAdmin() {
  const row = await batchRepo.findConfig();
  return {
    ...normalizeBatchConfig(row),
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  };
}

/**
 * Replace the config. Every field is required (the admin form always sends
 * the whole thing); validated here, audited with before/after.
 */
export async function updateConfig({ adminId, data, request }) {
  const tiers = Array.isArray(data?.tiers) ? data.tiers.map((t) => Number(t)) : null;
  const tierError = validateTiers(tiers);
  if (tierError) throw new BatchDiscountError('Tramos inválidos', tierError);
  if (![BATCH_ABSORBERS.CALICO, BATCH_ABSORBERS.SHARED].includes(data?.absorber)) {
    throw new BatchDiscountError('Absorber inválido', 'INVALID_ABSORBER');
  }

  const before = await getConfigForAdmin();
  const input = {
    isActive: Boolean(data.isActive),
    tiers,
    absorber: data.absorber,
    stacksWithCoupons: Boolean(data.stacksWithCoupons),
    appliesToManual: Boolean(data.appliesToManual),
  };
  const row = await batchRepo.upsertConfig(input, adminId);
  cache = null;

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.BATCH_DISCOUNT_UPDATE,
    targetType: 'BatchDiscountConfig',
    targetId: row.id,
    payload: {
      before: { isActive: before.isActive, tiers: before.tiers, absorber: before.absorber, stacksWithCoupons: before.stacksWithCoupons, appliesToManual: before.appliesToManual },
      after: input,
    },
    request,
  });

  return { ...normalizeBatchConfig(row), updatedAt: row.updatedAt, updatedById: row.updatedById };
}

/** Last changes for the admin page ("Últimos cambios"). */
export async function recentChanges(limit = 3) {
  const { items } = await auditService.listEntries({ action: ADMIN_ACTIONS.BATCH_DISCOUNT_UPDATE, limit });
  return items.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    adminName: e.admin?.name ?? null,
    before: e.payload?.before ?? null,
    after: e.payload?.after ?? null,
  }));
}

/** Test hook. */
export function _resetCache() {
  cache = null;
}
