/**
 * Coupon Service
 * Business rules for discount coupons — student side (validate, reserve,
 * release) and admin side (CRUD, activation, usage detail).
 *
 * Trust model: the client only ever sends a CODE. Every money figure
 * (discount, final amount, tutor payout base) is computed here from the
 * server-side course price and frozen into the payment intent, then
 * reconciled again when Wompi confirms. See docs/specs/functional.md.
 *
 * Usage limits count APPROVED redemptions plus RESERVED holds younger than
 * COUPON_HOLD_MINUTES (see coupon-math.js), so an abandoned checkout stops
 * blocking a slot on its own.
 */

import * as couponRepo from '../repositories/coupon.repository';
import * as auditService from './admin-audit.service';
import { CALICO_COMMISSION_RATE, TUTOR_SHARE_RATE } from '../payments/fees';
import {
  applyCoupon,
  normalizeCouponCode,
  isValidCouponCode,
  isValidDiscountValue,
  COUPON_ABSORBERS,
  COUPON_DISCOUNT_TYPES,
  COUPON_HOLD_MINUTES,
} from '../payments/coupon-math';

const { ADMIN_ACTIONS } = auditService;

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

/** Student-facing rejection codes. Each maps to an i18n message in the UI. */
export const COUPON_ERROR = Object.freeze({
  INVALID:            'COUPON_INVALID',            // unknown, deleted or inactive (never distinguished)
  NOT_STARTED:        'COUPON_NOT_STARTED',
  EXPIRED:            'COUPON_EXPIRED',
  EXHAUSTED:          'COUPON_EXHAUSTED',
  USER_LIMIT:         'COUPON_USER_LIMIT',
  FIRST_SESSION_ONLY: 'COUPON_FIRST_SESSION_ONLY',
  NOT_APPLICABLE:     'COUPON_NOT_APPLICABLE',     // would take nothing off (price at the minimum)
});

const COUPON_ERROR_CODES = new Set(Object.values(COUPON_ERROR));

export class CouponError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'CouponError';
    this.code = code;
  }
}

/** True for any rejection a student can be told about (→ HTTP 409/400). */
export function isCouponError(err) {
  return err instanceof CouponError || COUPON_ERROR_CODES.has(err?.code);
}

function domainError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const MAX_DESCRIPTION = 300;
const MAX_REDEMPTIONS_CAP = 1_000_000;
const PER_USER_LIMIT_CAP = 1_000;

const toNumber = (v) => (v == null ? 0 : Number(v));

// ─────────────────────────────────────────────────────────────────────────
// Student side
// ─────────────────────────────────────────────────────────────────────────

/** What the checkout is allowed to know about a coupon. Never limits/counters. */
function toPublicCoupon(coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? null,
    discountType: coupon.discountType,
    discountValue: toNumber(coupon.discountValue),
  };
}

/**
 * Load a coupon a student may use right now. Unknown, deleted and inactive
 * codes all fail as INVALID so the checkout cannot be used to probe which
 * disabled codes exist.
 */
async function loadUsableCoupon(rawCode, now) {
  const code = normalizeCouponCode(rawCode);
  if (!isValidCouponCode(code)) throw new CouponError(COUPON_ERROR.INVALID);

  const coupon = await couponRepo.findByCode(code);
  if (!coupon || coupon.deletedAt || !coupon.isActive) {
    throw new CouponError(COUPON_ERROR.INVALID);
  }
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw new CouponError(COUPON_ERROR.NOT_STARTED);
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    throw new CouponError(COUPON_ERROR.EXPIRED);
  }
  return coupon;
}

async function assertFirstSessionRule(coupon, userId) {
  if (!coupon.firstSessionOnly) return;
  if (await couponRepo.hasPriorPayments(userId)) {
    throw new CouponError(COUPON_ERROR.FIRST_SESSION_ONLY);
  }
}

/**
 * Limit checks against a usage snapshot.
 * `countOwnHolds` is false for the preview (the student's own abandoned
 * hold must not block their retry) and true inside the reservation, where
 * the repository has already released that user's previous holds.
 */
function assertUsageWithin(coupon, usage, { countOwnHolds }) {
  const holds = countOwnHolds
    ? usage.activeHolds
    : Math.max(0, usage.activeHolds - usage.userActiveHolds);

  if (coupon.maxRedemptions != null && usage.approvedCount + holds >= coupon.maxRedemptions) {
    throw new CouponError(COUPON_ERROR.EXHAUSTED);
  }
  if (usage.userApprovedCount >= coupon.perUserLimit) {
    throw new CouponError(COUPON_ERROR.USER_LIMIT);
  }
}

function priceOrThrow(coupon, originalAmount) {
  const pricing = applyCoupon({ coupon, originalAmount });
  if (!pricing.applicable) throw new CouponError(COUPON_ERROR.NOT_APPLICABLE);
  return pricing;
}

/**
 * Preview for the checkout: validates everything but reserves nothing.
 *
 * @param {{ code: string, userId: string, originalAmount: number, now?: Date }} args
 * @returns {Promise<{ coupon: object, pricing: object }>}
 * @throws {CouponError}
 */
export async function previewForBooking({ code, userId, originalAmount, now = new Date() }) {
  const coupon = await loadUsableCoupon(code, now);
  await assertFirstSessionRule(coupon, userId);
  const usage = await couponRepo.usageSnapshot({ couponId: coupon.id, userId });
  assertUsageWithin(coupon, usage, { countOwnHolds: false });
  const pricing = priceOrThrow(coupon, originalAmount);
  return { coupon: toPublicCoupon(coupon), pricing };
}

/**
 * Validate AND reserve one use for a payment intent (row-locked, see the
 * repository). The returned pricing is what the intent must be signed with.
 *
 * @returns {Promise<{ coupon: object, pricing: object, redemptionId: string }>}
 * @throws {CouponError}
 */
export async function reserveForIntent({ code, userId, originalAmount, intentReference, now = new Date() }) {
  if (!intentReference) throw domainError('Missing intent reference', 'INVALID_INPUT');
  const coupon = await loadUsableCoupon(code, now);
  await assertFirstSessionRule(coupon, userId);
  const pricing = priceOrThrow(coupon, originalAmount);

  const redemption = await couponRepo.reserveWithLock({
    couponId: coupon.id,
    userId,
    intentReference,
    snapshot: {
      originalAmount: pricing.originalAmount,
      discountAmount: pricing.discountAmount,
      finalAmount: pricing.finalAmount,
      tutorPayoutBase: pricing.tutorPayoutBase,
      absorber: pricing.absorber,
    },
    check: (usage) => assertUsageWithin(coupon, usage, { countOwnHolds: true }),
  });

  return { coupon: toPublicCoupon(coupon), pricing, redemptionId: redemption.id };
}

/** Release the hold of a failed/abandoned intent. Best-effort, never throws. */
export async function releaseByReference(intentReference) {
  try {
    const { count } = await couponRepo.releaseByReference(intentReference);
    return count;
  } catch (err) {
    console.warn(`[CouponService] Failed to release hold for ${intentReference}:`, err.message);
    return 0;
  }
}

export async function findRedemptionByReference(intentReference) {
  return couponRepo.findRedemptionByReference(intentReference);
}

// ─────────────────────────────────────────────────────────────────────────
// Admin side
// ─────────────────────────────────────────────────────────────────────────

export const COUPON_STATUS = Object.freeze({
  ACTIVE:    'active',
  INACTIVE:  'inactive',
  SCHEDULED: 'scheduled',
  EXPIRED:   'expired',
  EXHAUSTED: 'exhausted',
  DELETED:   'deleted',
});

const LIST_FILTERS = new Set(['all', ...Object.values(COUPON_STATUS)]);

/** Effective state of a coupon right now — what the admin list shows as a chip. */
export function computeCouponStatus(coupon, stats = {}, now = new Date()) {
  if (coupon.deletedAt) return COUPON_STATUS.DELETED;
  if (!coupon.isActive) return COUPON_STATUS.INACTIVE;
  if (coupon.validFrom && new Date(coupon.validFrom) > now) return COUPON_STATUS.SCHEDULED;
  if (coupon.validUntil && new Date(coupon.validUntil) < now) return COUPON_STATUS.EXPIRED;
  if (coupon.maxRedemptions != null && toNumber(stats.approvedCount) >= coupon.maxRedemptions) {
    return COUPON_STATUS.EXHAUSTED;
  }
  return COUPON_STATUS.ACTIVE;
}

const EMPTY_STATS = Object.freeze({
  approvedCount: 0, activeHolds: 0, uniqueUsers: 0,
  discountTotal: 0, discountCalico: 0, chargedTotal: 0, listTotal: 0, tutorBaseTotal: 0,
});

/**
 * Who paid for the coupon so far. Calico eats the CALICO-absorbed part in
 * full plus its commission share of the SHARED part; tutors eat their share
 * of the SHARED part. Wompi's (small) fee reduction is deliberately ignored.
 */
function costSplit(stats) {
  const discountShared = Math.max(0, stats.discountTotal - stats.discountCalico);
  return {
    discountShared: Number(discountShared.toFixed(2)),
    calicoCost: Number((stats.discountCalico + CALICO_COMMISSION_RATE * discountShared).toFixed(2)),
    tutorCost:  Number((TUTOR_SHARE_RATE * discountShared).toFixed(2)),
  };
}

function serializeCoupon(coupon, stats = EMPTY_STATS, now = new Date()) {
  const s = { ...EMPTY_STATS, ...stats };
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description ?? null,
    discountType: coupon.discountType,
    discountValue: toNumber(coupon.discountValue),
    absorber: coupon.absorber,
    maxRedemptions: coupon.maxRedemptions ?? null,
    perUserLimit: coupon.perUserLimit,
    firstSessionOnly: Boolean(coupon.firstSessionOnly),
    validFrom: coupon.validFrom ?? null,
    validUntil: coupon.validUntil ?? null,
    isActive: Boolean(coupon.isActive),
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
    deletedAt: coupon.deletedAt ?? null,
    createdBy: coupon.createdBy ?? null,
    status: computeCouponStatus(coupon, s, now),
    stats: { ...s, ...costSplit(s) },
  };
}

/**
 * Admin list with per-coupon usage. `status` filters on the computed state
 * ('all' = every non-deleted coupon; 'deleted' = only deleted ones).
 */
export async function listCoupons({ status = 'all', search = '', now = new Date() } = {}) {
  const filter = LIST_FILTERS.has(status) ? status : 'all';
  const [coupons, statsMap] = await Promise.all([
    couponRepo.findAll({ includeDeleted: filter === COUPON_STATUS.DELETED }),
    couponRepo.usageStatsByCoupon(),
  ]);
  const needle = normalizeCouponCode(search);

  const items = coupons
    .map((c) => serializeCoupon(c, statsMap.get(c.id), now))
    .filter((c) => (filter === 'all' ? c.status !== COUPON_STATUS.DELETED : c.status === filter))
    .filter((c) => !needle || c.code.includes(needle));

  return { items, total: items.length };
}

function serializeRedemption(r, now = new Date()) {
  let effectiveStatus = String(r.status).toLowerCase();
  if (r.status === 'RESERVED') {
    const ageMs = now.getTime() - new Date(r.reservedAt).getTime();
    effectiveStatus = ageMs > COUPON_HOLD_MINUTES * 60_000 ? 'expired' : 'reserved';
  }
  return {
    id: r.id,
    status: effectiveStatus,
    intentReference: r.intentReference,
    originalAmount: toNumber(r.originalAmount),
    discountAmount: toNumber(r.discountAmount),
    finalAmount: toNumber(r.finalAmount),
    tutorPayoutBase: toNumber(r.tutorPayoutBase),
    absorber: r.absorber,
    reservedAt: r.reservedAt,
    approvedAt: r.approvedAt ?? null,
    releasedAt: r.releasedAt ?? null,
    user: r.user ?? null,
    session: r.session ?? null,
    payment: r.payment ?? null,
  };
}

/** One coupon with its redemptions (traceability view). */
export async function getCouponDetail(id, { now = new Date() } = {}) {
  const coupon = await couponRepo.findById(id);
  if (!coupon) throw domainError('Cupón no encontrado', 'NOT_FOUND');

  const [statsMap, redemptions] = await Promise.all([
    couponRepo.usageStatsByCoupon(),
    couponRepo.findRedemptionsForAdmin(id),
  ]);

  return {
    coupon: serializeCoupon(coupon, statsMap.get(id), now),
    redemptions: redemptions.map((r) => serializeRedemption(r, now)),
  };
}

// ─── Input validation ────────────────────────────────────────────────────

function toDateOrNull(v, field) {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw domainError(`${field} no es una fecha válida`, 'VALIDATION_ERROR');
  return d;
}

/**
 * Normalise + validate admin input. With `existing` (update), cross-field
 * rules (type/value, date order) are checked against the merged result.
 * Returns only the fields present in `data`, ready for Prisma.
 */
function normalizeCouponInput(data, existing = null) {
  const out = {};

  if (data.code !== undefined) {
    const code = normalizeCouponCode(data.code);
    if (!isValidCouponCode(code)) {
      throw domainError(
        'El código debe tener entre 3 y 24 caracteres: letras, números, guion o guion bajo',
        'VALIDATION_ERROR',
      );
    }
    out.code = code;
  }

  if (data.description !== undefined) {
    const d = data.description == null ? null : String(data.description).trim();
    if (d && d.length > MAX_DESCRIPTION) {
      throw domainError(`La descripción no puede exceder ${MAX_DESCRIPTION} caracteres`, 'VALIDATION_ERROR');
    }
    out.description = d || null;
  }

  if (data.discountType !== undefined) {
    if (!Object.values(COUPON_DISCOUNT_TYPES).includes(data.discountType)) {
      throw domainError('Tipo de descuento inválido', 'VALIDATION_ERROR');
    }
    out.discountType = data.discountType;
  }
  if (data.discountValue !== undefined) out.discountValue = Number(data.discountValue);

  const type = out.discountType ?? existing?.discountType;
  const value = out.discountValue ?? (existing ? toNumber(existing.discountValue) : undefined);
  if (type === undefined || value === undefined) {
    throw domainError('Tipo y valor del descuento son obligatorios', 'VALIDATION_ERROR');
  }
  if (!isValidDiscountValue(type, value)) {
    throw domainError(
      type === COUPON_DISCOUNT_TYPES.PERCENT
        ? 'El porcentaje debe ser un entero entre 1 y 99'
        : 'El monto fijo debe ser un entero entre 1.000 y 1.000.000 COP',
      'VALIDATION_ERROR',
    );
  }

  if (data.absorber !== undefined) {
    if (!Object.values(COUPON_ABSORBERS).includes(data.absorber)) {
      throw domainError('Valor inválido para quién asume el descuento', 'VALIDATION_ERROR');
    }
    out.absorber = data.absorber;
  }

  if (data.maxRedemptions !== undefined) {
    if (data.maxRedemptions == null || data.maxRedemptions === '') {
      out.maxRedemptions = null;
    } else {
      const n = Number(data.maxRedemptions);
      if (!Number.isInteger(n) || n < 1 || n > MAX_REDEMPTIONS_CAP) {
        throw domainError('El límite de usos debe ser un entero mayor o igual a 1', 'VALIDATION_ERROR');
      }
      out.maxRedemptions = n;
    }
  }

  if (data.perUserLimit !== undefined) {
    const n = Number(data.perUserLimit);
    if (!Number.isInteger(n) || n < 1 || n > PER_USER_LIMIT_CAP) {
      throw domainError('El límite por usuario debe ser un entero mayor o igual a 1', 'VALIDATION_ERROR');
    }
    out.perUserLimit = n;
  }

  if (data.firstSessionOnly !== undefined) out.firstSessionOnly = Boolean(data.firstSessionOnly);
  if (data.isActive !== undefined) out.isActive = Boolean(data.isActive);

  if (data.validFrom !== undefined) out.validFrom = toDateOrNull(data.validFrom, 'validFrom');
  if (data.validUntil !== undefined) out.validUntil = toDateOrNull(data.validUntil, 'validUntil');

  const from = out.validFrom !== undefined ? out.validFrom : existing?.validFrom ?? null;
  const until = out.validUntil !== undefined ? out.validUntil : existing?.validUntil ?? null;
  if (from && until && new Date(from) >= new Date(until)) {
    throw domainError('La fecha de inicio debe ser anterior a la fecha de fin', 'VALIDATION_ERROR');
  }

  return out;
}

function auditSnapshot(coupon) {
  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: toNumber(coupon.discountValue),
    absorber: coupon.absorber,
    maxRedemptions: coupon.maxRedemptions ?? null,
    perUserLimit: coupon.perUserLimit,
    firstSessionOnly: Boolean(coupon.firstSessionOnly),
    validFrom: coupon.validFrom ?? null,
    validUntil: coupon.validUntil ?? null,
    isActive: Boolean(coupon.isActive),
    description: coupon.description ?? null,
  };
}

function rethrowUniqueCode(err) {
  if (err?.code === 'P2002') throw domainError('Ya existe un cupón con ese código', 'COUPON_CODE_EXISTS');
  throw err;
}

// ─── Mutations (all audited) ─────────────────────────────────────────────

export async function createCoupon({ adminId, data, request }) {
  const input = normalizeCouponInput(data);
  if (!input.code) throw domainError('El código es obligatorio', 'VALIDATION_ERROR');

  let created;
  try {
    created = await couponRepo.create({ ...input, createdById: adminId });
  } catch (err) {
    rethrowUniqueCode(err);
  }

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COUPON_CREATE,
    targetType: 'Coupon',
    targetId: created.id,
    payload: auditSnapshot(created),
    request,
  });

  return serializeCoupon(created);
}

/**
 * Partial update. Activating/deactivating is just `isActive`. The code is
 * locked once the coupon has any redemption (traceability).
 */
export async function updateCoupon({ adminId, id, data, request }) {
  const existing = await couponRepo.findById(id);
  if (!existing || existing.deletedAt) throw domainError('Cupón no encontrado', 'NOT_FOUND');

  const input = normalizeCouponInput(data, existing);
  if (input.code && input.code !== existing.code) {
    const used = await couponRepo.countRedemptions(id);
    if (used > 0) {
      throw domainError('No se puede cambiar el código de un cupón que ya tiene usos', 'COUPON_CODE_LOCKED');
    }
  }

  const before = auditSnapshot(existing);
  const changed = Object.keys(input).filter((k) => {
    const a = before[k] instanceof Date ? before[k].toISOString() : before[k];
    const b = input[k] instanceof Date ? input[k].toISOString() : input[k];
    return a !== b;
  });
  if (changed.length === 0) return serializeCoupon(existing);

  const patch = Object.fromEntries(changed.map((k) => [k, input[k]]));
  let updated;
  try {
    updated = await couponRepo.update(id, patch);
  } catch (err) {
    rethrowUniqueCode(err);
  }

  const after = auditSnapshot(updated);
  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COUPON_UPDATE,
    targetType: 'Coupon',
    targetId: id,
    payload: {
      code: updated.code,
      fields: changed,
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    },
    request,
  });

  return serializeCoupon(updated);
}

/**
 * Soft-delete when the coupon has redemptions (history must survive),
 * hard-delete when it was never used.
 */
export async function deleteCoupon({ adminId, id, request }) {
  const existing = await couponRepo.findById(id);
  if (!existing || existing.deletedAt) throw domainError('Cupón no encontrado', 'NOT_FOUND');

  const used = await couponRepo.countRedemptions(id);
  const mode = used > 0 ? 'soft' : 'hard';
  if (mode === 'soft') await couponRepo.softDelete(id);
  else await couponRepo.hardDelete(id);

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.COUPON_DELETE,
    targetType: 'Coupon',
    targetId: id,
    payload: { code: existing.code, mode, redemptions: used },
    request,
  });

  return { id, code: existing.code, mode, redemptions: used };
}
