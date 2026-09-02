/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/coupon.service.js.
 * The repository and audit service are mocked; the coupon math (coupon-math.js)
 * and fee math (fees.js) are REAL so the pricing that ends up in the payment
 * intent is validated end-to-end.
 */

jest.mock('@/lib/repositories/coupon.repository', () => ({
  findByCode: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  hardDelete: jest.fn(),
  countRedemptions: jest.fn(),
  usageSnapshot: jest.fn(),
  usageStatsByCoupon: jest.fn(),
  hasPriorPayments: jest.fn(),
  reserveWithLock: jest.fn(),
  findRedemptionByReference: jest.fn(),
  releaseByReference: jest.fn(),
  createApproved: jest.fn(),
  findRedemptionsForAdmin: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: {
    COUPON_CREATE: 'COUPON_CREATE',
    COUPON_UPDATE: 'COUPON_UPDATE',
    COUPON_DELETE: 'COUPON_DELETE',
  },
  logAction: jest.fn(),
}));

const repo = require('@/lib/repositories/coupon.repository');
const audit = require('@/lib/services/admin-audit.service');
const service = require('@/lib/services/coupon.service');

const NOW = new Date('2026-09-01T12:00:00.000Z');

function coupon(overrides = {}) {
  return {
    id: 'coupon-1',
    code: 'PROMO10',
    description: null,
    discountType: 'PERCENT',
    discountValue: '10.00', // Prisma Decimal arrives as a string
    absorber: 'CALICO',
    maxRedemptions: 10,
    perUserLimit: 1,
    firstSessionOnly: false,
    validFrom: null,
    validUntil: null,
    isActive: true,
    createdById: 'admin-1',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deletedAt: null,
    createdBy: { id: 'admin-1', name: 'Admin' },
    ...overrides,
  };
}

const NO_USAGE = { approvedCount: 0, activeHolds: 0, userApprovedCount: 0, userActiveHolds: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  repo.findByCode.mockResolvedValue(coupon());
  repo.usageSnapshot.mockResolvedValue(NO_USAGE);
  repo.hasPriorPayments.mockResolvedValue(false);
  audit.logAction.mockResolvedValue(undefined);
});

// ─── previewForBooking ─────────────────────────────────────────────────

describe('previewForBooking', () => {
  const args = { code: ' promo10 ', userId: 'u1', originalAmount: 60000, now: NOW };

  it('returns the pricing and a public coupon (never limits or counters)', async () => {
    const out = await service.previewForBooking(args);

    expect(repo.findByCode).toHaveBeenCalledWith('PROMO10'); // normalised
    expect(out.pricing).toMatchObject({
      originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: 'CALICO',
    });
    expect(out.coupon).toEqual({
      id: 'coupon-1', code: 'PROMO10', description: null, discountType: 'PERCENT', discountValue: 10,
    });
    expect(out.coupon.maxRedemptions).toBeUndefined();
  });

  it.each([
    ['malformed code', { code: 'a' }, {}, 'COUPON_INVALID'],
    ['unknown code', {}, { findByCode: null }, 'COUPON_INVALID'],
    ['inactive coupon', {}, { findByCode: coupon({ isActive: false }) }, 'COUPON_INVALID'],
    ['deleted coupon', {}, { findByCode: coupon({ deletedAt: NOW }) }, 'COUPON_INVALID'],
    ['not started yet', {}, { findByCode: coupon({ validFrom: new Date('2026-10-01') }) }, 'COUPON_NOT_STARTED'],
    ['expired', {}, { findByCode: coupon({ validUntil: new Date('2026-08-01') }) }, 'COUPON_EXPIRED'],
  ])('rejects %s', async (_label, argOverrides, mocks, code) => {
    if ('findByCode' in mocks) repo.findByCode.mockResolvedValue(mocks.findByCode);
    await expect(service.previewForBooking({ ...args, ...argOverrides })).rejects.toMatchObject({ code });
  });

  it('counts approved uses + other users’ active holds against maxRedemptions', async () => {
    repo.usageSnapshot.mockResolvedValue({ approvedCount: 8, activeHolds: 2, userApprovedCount: 0, userActiveHolds: 0 });
    await expect(service.previewForBooking(args)).rejects.toMatchObject({ code: 'COUPON_EXHAUSTED' });
  });

  it('does NOT let the student’s own abandoned hold block their retry', async () => {
    repo.usageSnapshot.mockResolvedValue({ approvedCount: 9, activeHolds: 1, userApprovedCount: 0, userActiveHolds: 1 });
    const out = await service.previewForBooking(args);
    expect(out.pricing.discountAmount).toBe(6000);
  });

  it('enforces the per-user limit', async () => {
    repo.usageSnapshot.mockResolvedValue({ ...NO_USAGE, userApprovedCount: 1 });
    await expect(service.previewForBooking(args)).rejects.toMatchObject({ code: 'COUPON_USER_LIMIT' });
  });

  it('enforces firstSessionOnly against prior payments', async () => {
    repo.findByCode.mockResolvedValue(coupon({ firstSessionOnly: true }));
    repo.hasPriorPayments.mockResolvedValue(true);
    await expect(service.previewForBooking(args)).rejects.toMatchObject({ code: 'COUPON_FIRST_SESSION_ONLY' });
    expect(repo.hasPriorPayments).toHaveBeenCalledWith('u1');
  });

  it('rejects a coupon that would take nothing off (price at the minimum charge)', async () => {
    await expect(service.previewForBooking({ ...args, originalAmount: 1500 }))
      .rejects.toMatchObject({ code: 'COUPON_NOT_APPLICABLE' });
  });

  it('SHARED coupons put the tutor share on the discounted amount', async () => {
    repo.findByCode.mockResolvedValue(coupon({ absorber: 'SHARED' }));
    const out = await service.previewForBooking(args);
    expect(out.pricing.tutorPayoutBase).toBe(54000);
  });
});

// ─── reserveForIntent ──────────────────────────────────────────────────

describe('reserveForIntent', () => {
  it('reserves a hold with the pricing snapshot and returns its id', async () => {
    repo.reserveWithLock.mockResolvedValue({ id: 'red-1' });

    const out = await service.reserveForIntent({
      code: 'PROMO10', userId: 'u1', originalAmount: 60000, intentReference: 'TXN-1', now: NOW,
    });

    expect(out.redemptionId).toBe('red-1');
    const call = repo.reserveWithLock.mock.calls[0][0];
    expect(call).toMatchObject({
      couponId: 'coupon-1',
      userId: 'u1',
      intentReference: 'TXN-1',
      snapshot: { originalAmount: 60000, discountAmount: 6000, finalAmount: 54000, tutorPayoutBase: 60000, absorber: 'CALICO' },
    });
    expect(typeof call.check).toBe('function');
  });

  it('the injected check rejects when approved + ALL active holds reach the limit', async () => {
    repo.reserveWithLock.mockImplementation(async ({ check }) => {
      check({ approvedCount: 9, activeHolds: 1, userApprovedCount: 0, userActiveHolds: 0 });
      return { id: 'red-1' };
    });
    await expect(service.reserveForIntent({
      code: 'PROMO10', userId: 'u1', originalAmount: 60000, intentReference: 'TXN-1', now: NOW,
    })).rejects.toMatchObject({ code: 'COUPON_EXHAUSTED' });
  });

  it('requires an intent reference', async () => {
    await expect(service.reserveForIntent({ code: 'PROMO10', userId: 'u1', originalAmount: 60000 }))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(repo.reserveWithLock).not.toHaveBeenCalled();
  });
});

// ─── approval at payment time ──────────────────────────────────────────

describe('prepareRedemptionApproval', () => {
  const args = { couponId: 'coupon-1', intentReference: 'TXN-1', userId: 'u1', now: NOW };

  it('a fresh RESERVED hold is approved as-is: no re-check, no coupon lookup', async () => {
    repo.findRedemptionByReference.mockResolvedValue({ id: 'r1', status: 'RESERVED', reservedAt: new Date(NOW.getTime() - 5 * 60_000) });
    const out = await service.prepareRedemptionApproval(args);
    expect(out).toMatchObject({ fresh: true, check: null });
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.usageSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ['an expired hold', { id: 'r1', status: 'RESERVED', reservedAt: new Date(NOW.getTime() - 45 * 60_000) }],
    ['a released hold', { id: 'r1', status: 'RELEASED', reservedAt: NOW }],
    ['a missing row', null],
  ])('%s is re-validated (preliminary check now, authoritative check under the lock)', async (_label, existing) => {
    repo.findRedemptionByReference.mockResolvedValue(existing);
    repo.findById.mockResolvedValue(coupon({ maxRedemptions: 10, perUserLimit: 1 }));
    repo.usageSnapshot.mockResolvedValue(NO_USAGE);

    const out = await service.prepareRedemptionApproval(args);

    expect(out.fresh).toBe(false);
    expect(typeof out.check).toBe('function');
    // The intent's own row never counts against itself.
    expect(repo.usageSnapshot).toHaveBeenCalledWith({ couponId: 'coupon-1', userId: 'u1', excludeReference: 'TXN-1' });
    // The check the repository will run under the lock enforces the limits.
    expect(() => out.check({ approvedCount: 1, activeHolds: 0, userApprovedCount: 1, userActiveHolds: 0 }))
      .toThrow(expect.objectContaining({ code: 'COUPON_USER_LIMIT' }));
    expect(() => out.check({ approvedCount: 9, activeHolds: 1, userApprovedCount: 0, userActiveHolds: 0 }))
      .toThrow(expect.objectContaining({ code: 'COUPON_EXHAUSTED' }));
  });

  it('refuses up front when the student already used their allowance (pre-minted intents)', async () => {
    repo.findRedemptionByReference.mockResolvedValue({ id: 'r1', status: 'RELEASED', reservedAt: NOW });
    repo.findById.mockResolvedValue(coupon({ perUserLimit: 1 }));
    repo.usageSnapshot.mockResolvedValue({ ...NO_USAGE, userApprovedCount: 1 });
    await expect(service.prepareRedemptionApproval(args)).rejects.toMatchObject({ code: 'COUPON_USER_LIMIT' });
  });

  it('never honours a deleted coupon past its hold window', async () => {
    repo.findRedemptionByReference.mockResolvedValue(null);
    repo.findById.mockResolvedValue(coupon({ deletedAt: NOW }));
    repo.usageSnapshot.mockResolvedValue(NO_USAGE);
    await expect(service.prepareRedemptionApproval(args)).rejects.toMatchObject({ code: 'COUPON_INVALID' });
  });
});

describe('isFreshHold', () => {
  it('is true only for RESERVED rows inside the hold window', () => {
    expect(service.isFreshHold({ status: 'RESERVED', reservedAt: new Date(NOW.getTime() - 29 * 60_000) }, NOW)).toBe(true);
    expect(service.isFreshHold({ status: 'RESERVED', reservedAt: new Date(NOW.getTime() - 31 * 60_000) }, NOW)).toBe(false);
    expect(service.isFreshHold({ status: 'RELEASED', reservedAt: NOW }, NOW)).toBe(false);
    expect(service.isFreshHold(null, NOW)).toBe(false);
  });
});

describe('releaseByReference', () => {
  it('returns the released count and never throws', async () => {
    repo.releaseByReference.mockResolvedValue({ count: 1 });
    await expect(service.releaseByReference('TXN-1')).resolves.toBe(1);
    repo.releaseByReference.mockRejectedValue(new Error('db down'));
    await expect(service.releaseByReference('TXN-1')).resolves.toBe(0);
  });
});

// ─── status + listing ──────────────────────────────────────────────────

describe('computeCouponStatus', () => {
  it.each([
    ['deleted', coupon({ deletedAt: NOW }), {}, 'deleted'],
    ['inactive', coupon({ isActive: false }), {}, 'inactive'],
    ['scheduled', coupon({ validFrom: new Date('2026-10-01') }), {}, 'scheduled'],
    ['expired', coupon({ validUntil: new Date('2026-08-01') }), {}, 'expired'],
    ['exhausted', coupon({ maxRedemptions: 10 }), { approvedCount: 10 }, 'exhausted'],
    ['unlimited never exhausts', coupon({ maxRedemptions: null }), { approvedCount: 999 }, 'active'],
    ['active', coupon(), { approvedCount: 3 }, 'active'],
  ])('%s', (_label, c, stats, expected) => {
    expect(service.computeCouponStatus(c, stats, NOW)).toBe(expected);
  });
});

describe('listCoupons', () => {
  beforeEach(() => {
    repo.findAll.mockResolvedValue([
      coupon({ id: 'a', code: 'ACTIVE10' }),
      coupon({ id: 'b', code: 'OLD10', validUntil: new Date('2026-01-01') }),
      coupon({ id: 'c', code: 'SHARED5', absorber: 'SHARED' }),
    ]);
    repo.usageStatsByCoupon.mockResolvedValue(new Map([
      ['a', { approvedCount: 2, activeHolds: 1, uniqueUsers: 2, discountTotal: 12000, discountCalico: 12000, chargedTotal: 108000, listTotal: 120000, tutorBaseTotal: 120000 }],
      ['c', { approvedCount: 1, activeHolds: 0, uniqueUsers: 1, discountTotal: 6000, discountCalico: 0, chargedTotal: 54000, listTotal: 60000, tutorBaseTotal: 54000 }],
    ]));
  });

  it('merges stats, computes status and the cost split per coupon', async () => {
    const { items, total } = await service.listCoupons({ now: NOW });
    expect(total).toBe(3);

    const a = items.find((c) => c.id === 'a');
    expect(a.status).toBe('active');
    expect(a.discountValue).toBe(10);
    expect(a.stats).toMatchObject({ approvedCount: 2, activeHolds: 1, discountTotal: 12000, discountCalico: 12000, discountShared: 0, calicoCost: 12000, tutorCost: 0 });

    // SHARED: Calico eats 15 % of the discount, tutors 85 %.
    const c = items.find((x) => x.id === 'c');
    expect(c.stats).toMatchObject({ discountShared: 6000, calicoCost: 900, tutorCost: 5100 });

    const b = items.find((x) => x.id === 'b');
    expect(b.status).toBe('expired');
    expect(b.stats.approvedCount).toBe(0);
  });

  it('filters by computed status and by code fragment', async () => {
    const expired = await service.listCoupons({ status: 'expired', now: NOW });
    expect(expired.items.map((c) => c.code)).toEqual(['OLD10']);

    const search = await service.listCoupons({ search: 'shar', now: NOW });
    expect(search.items.map((c) => c.code)).toEqual(['SHARED5']);
  });

  it('only asks the repository for deleted rows when listing deleted coupons', async () => {
    await service.listCoupons({ status: 'deleted', now: NOW });
    expect(repo.findAll).toHaveBeenLastCalledWith({ includeDeleted: true });
    await service.listCoupons({ status: 'all', now: NOW });
    expect(repo.findAll).toHaveBeenLastCalledWith({ includeDeleted: false });
  });
});

// ─── admin mutations ───────────────────────────────────────────────────

describe('createCoupon', () => {
  const base = { code: 'parciales 10', discountType: 'PERCENT', discountValue: 10, absorber: 'CALICO' };

  it('normalises the code, stores the creator and audits the creation', async () => {
    repo.create.mockImplementation(async (data) => coupon({ ...data, id: 'new-1' }));

    const out = await service.createCoupon({ adminId: 'admin-1', data: base, request: null });

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PARCIALES10', discountType: 'PERCENT', discountValue: 10, absorber: 'CALICO', createdById: 'admin-1',
    }));
    expect(out.code).toBe('PARCIALES10');
    expect(out.status).toBe('active');
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', action: 'COUPON_CREATE', targetType: 'Coupon', targetId: 'new-1',
      payload: expect.objectContaining({ code: 'PARCIALES10', discountValue: 10 }),
    }));
  });

  it.each([
    ['a percent over 99', { ...base, discountValue: 150 }],
    ['a fixed amount under 1 000', { ...base, discountType: 'FIXED', discountValue: 500 }],
    ['a bad code', { ...base, code: '!!' }],
    ['a bad absorber', { ...base, absorber: 'TUTOR' }],
    ['dates out of order', { ...base, validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-09-01T00:00:00.000Z' }],
    ['a per-user limit of 0', { ...base, perUserLimit: 0 }],
  ])('rejects %s with VALIDATION_ERROR', async (_label, data) => {
    await expect(service.createCoupon({ adminId: 'admin-1', data })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('maps a unique-code violation to COUPON_CODE_EXISTS', async () => {
    repo.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.createCoupon({ adminId: 'admin-1', data: base })).rejects.toMatchObject({ code: 'COUPON_CODE_EXISTS' });
  });

  it('accepts an empty maxRedemptions as "unlimited"', async () => {
    repo.create.mockImplementation(async (data) => coupon({ ...data }));
    await service.createCoupon({ adminId: 'admin-1', data: { ...base, maxRedemptions: '' } });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ maxRedemptions: null }));
  });
});

describe('updateCoupon', () => {
  beforeEach(() => {
    repo.findById.mockResolvedValue(coupon());
    repo.countRedemptions.mockResolvedValue(0);
    repo.update.mockImplementation(async (id, data) => coupon({ ...data }));
  });

  it('applies only the changed fields and audits before/after', async () => {
    await service.updateCoupon({ adminId: 'admin-1', id: 'coupon-1', data: { isActive: false, discountValue: 10 } });

    expect(repo.update).toHaveBeenCalledWith('coupon-1', { isActive: false });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COUPON_UPDATE',
      payload: expect.objectContaining({
        fields: ['isActive'],
        before: { isActive: true },
        after: { isActive: false },
      }),
    }));
  });

  it('is a no-op (no write, no audit) when nothing changes', async () => {
    const out = await service.updateCoupon({ adminId: 'admin-1', id: 'coupon-1', data: { discountValue: 10 } });
    expect(repo.update).not.toHaveBeenCalled();
    expect(audit.logAction).not.toHaveBeenCalled();
    expect(out.code).toBe('PROMO10');
  });

  it('locks the code once the coupon has redemptions', async () => {
    repo.countRedemptions.mockResolvedValue(3);
    await expect(service.updateCoupon({ adminId: 'admin-1', id: 'coupon-1', data: { code: 'OTHER' } }))
      .rejects.toMatchObject({ code: 'COUPON_CODE_LOCKED' });
  });

  it('validates the merged type/value (switching to FIXED keeps the old 10 → invalid)', async () => {
    await expect(service.updateCoupon({ adminId: 'admin-1', id: 'coupon-1', data: { discountType: 'FIXED' } }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('404s on unknown or deleted coupons', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.updateCoupon({ adminId: 'admin-1', id: 'nope', data: { isActive: true } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteCoupon', () => {
  beforeEach(() => {
    repo.findById.mockResolvedValue(coupon());
  });

  it('soft-deletes a coupon that has redemptions', async () => {
    repo.countRedemptions.mockResolvedValue(4);
    const out = await service.deleteCoupon({ adminId: 'admin-1', id: 'coupon-1' });
    expect(repo.softDelete).toHaveBeenCalledWith('coupon-1');
    expect(repo.hardDelete).not.toHaveBeenCalled();
    expect(out).toEqual({ id: 'coupon-1', code: 'PROMO10', mode: 'soft', redemptions: 4 });
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'COUPON_DELETE', payload: { code: 'PROMO10', mode: 'soft', redemptions: 4 },
    }));
  });

  it('hard-deletes a coupon that was never used', async () => {
    repo.countRedemptions.mockResolvedValue(0);
    const out = await service.deleteCoupon({ adminId: 'admin-1', id: 'coupon-1' });
    expect(repo.hardDelete).toHaveBeenCalledWith('coupon-1');
    expect(out.mode).toBe('hard');
  });
});

describe('getCouponDetail', () => {
  it('serialises redemptions and marks stale holds as expired', async () => {
    repo.findById.mockResolvedValue(coupon());
    repo.usageStatsByCoupon.mockResolvedValue(new Map());
    repo.findRedemptionsForAdmin.mockResolvedValue([
      { id: 'r1', status: 'APPROVED', intentReference: 'T1', originalAmount: '60000', discountAmount: '6000', finalAmount: '54000', tutorPayoutBase: '60000', absorber: 'CALICO', reservedAt: NOW, approvedAt: NOW, user: { id: 'u1', name: 'Ana', email: 'a@x' } },
      { id: 'r2', status: 'RESERVED', intentReference: 'T2', originalAmount: '60000', discountAmount: '6000', finalAmount: '54000', tutorPayoutBase: '60000', absorber: 'CALICO', reservedAt: new Date(NOW.getTime() - 45 * 60_000), user: null },
      { id: 'r3', status: 'RESERVED', intentReference: 'T3', originalAmount: '60000', discountAmount: '6000', finalAmount: '54000', tutorPayoutBase: '60000', absorber: 'CALICO', reservedAt: new Date(NOW.getTime() - 5 * 60_000), user: null },
    ]);

    const { coupon: c, redemptions } = await service.getCouponDetail('coupon-1', { now: NOW });
    expect(c.id).toBe('coupon-1');
    expect(redemptions.map((r) => r.status)).toEqual(['approved', 'expired', 'reserved']);
    expect(redemptions[0].discountAmount).toBe(6000);
  });
});
