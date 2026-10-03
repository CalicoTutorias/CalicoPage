/** @jest-environment node */
jest.mock('@/lib/payments/pricing', () => ({ resolveSessionAmount: jest.fn() }));
jest.mock('@/lib/services/wompi.service', () => ({ processSuccessfulPayment: jest.fn() }));

const { resolveSessionAmount } = require('@/lib/payments/pricing');
const WompiService = require('@/lib/services/wompi.service');
const checkout = require('@/lib/payments/checkout');

const SESSION_META = {
  studentId: 's1', tutorId: 't1', courseId: 'c1',
  startTimestamp: '2026-10-10T15:00:00.000Z', endTimestamp: '2026-10-10T16:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('intentKind', () => {
  it('defaults to session for legacy rows and missing intents', () => {
    expect(checkout.intentKind(null)).toBe('session');
    expect(checkout.intentKind({ metadata: {} })).toBe('session');
  });
  it('reads the column first, then metadata.kind', () => {
    expect(checkout.intentKind({ kind: 'event', metadata: {} })).toBe('event');
    expect(checkout.intentKind({ metadata: { kind: 'event' } })).toBe('event');
  });
});

describe('frozenAmountCop', () => {
  it('session: original − discount from the persisted snapshot', () => {
    expect(checkout.frozenAmountCop({ metadata: { ...SESSION_META, originalAmount: '50000', discountAmount: '5000' } })).toBe(45000);
    expect(checkout.frozenAmountCop({ metadata: { ...SESSION_META, originalAmount: '40000', discountAmount: '0' } })).toBe(40000);
  });
  it('event: finalAmount', () => {
    expect(checkout.frozenAmountCop({ kind: 'event', metadata: { finalAmount: '18000' } })).toBe(18000);
  });
  it('returns null for legacy intents without a snapshot', () => {
    expect(checkout.frozenAmountCop({ metadata: SESSION_META })).toBeNull();
    expect(checkout.frozenAmountCop(null)).toBeNull();
  });
});

describe('expectedAmountCents', () => {
  it('uses the frozen amount and never recomputes from the current course price', async () => {
    const stored = { metadata: { ...SESSION_META, originalAmount: '40000', discountAmount: '0' } };
    resolveSessionAmount.mockResolvedValue({ amount: 45000 }); // admin raised the price meanwhile
    await expect(checkout.expectedAmountCents({ stored, metadata: stored.metadata })).resolves.toBe(4000000);
    expect(resolveSessionAmount).not.toHaveBeenCalled();
  });
  it('legacy session intents fall back to the recomputed price minus any coupon snapshot', async () => {
    resolveSessionAmount.mockResolvedValue({ amount: 50000 });
    await expect(checkout.expectedAmountCents({ stored: { metadata: SESSION_META }, metadata: SESSION_META })).resolves.toBe(5000000);
  });
  it('returns null when nothing can be determined', async () => {
    await expect(checkout.expectedAmountCents({ stored: null, metadata: {} })).resolves.toBeNull();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resolveSessionAmount.mockRejectedValue(new Error('NO_PRICE'));
    await expect(checkout.expectedAmountCents({ stored: { metadata: SESSION_META }, metadata: SESSION_META })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[checkout]'), 'NO_PRICE');
    warn.mockRestore();
  });
});

describe('amountMatches', () => {
  it('tolerates one cent', () => {
    expect(checkout.amountMatches(4000000, 4000000)).toBe(true);
    expect(checkout.amountMatches('4000001', 4000000)).toBe(true);
    expect(checkout.amountMatches(4000002, 4000000)).toBe(false);
  });
});

describe('fulfilApproved', () => {
  it('routes session intents to processSuccessfulPayment', async () => {
    WompiService.processSuccessfulPayment.mockResolvedValue({ ok: 1 });
    await expect(checkout.fulfilApproved({ id: 'tx' }, { metadata: SESSION_META })).resolves.toEqual({ ok: 1 });
  });
});
