/**
 * Group tutoring rules (src/lib/sessions/group-session.js) and the coupon
 * surcharge helper: pure math the booking form and the server share.
 */
import {
  GROUP_MAX_SIZE,
  buildGroupSnapshot,
  cleanInviteEmails,
  groupSurcharge,
  isAllowedGroupSize,
  maxGroupSizeOf,
  normalizeGroupSize,
  organizerIdOf,
  readGroupSnapshot,
} from '@/lib/sessions/group-session';
import { applyCoupon, isFreePricing, noCouponPricing, withSurcharge } from '@/lib/payments/coupon-math';

describe('groupSurcharge', () => {
  it('is 0 for an individual session', () => {
    expect(groupSurcharge({ groupSize: 1, hours: 2 })).toBe(0);
  });

  it('charges 10 000 per extra person per hour', () => {
    expect(groupSurcharge({ groupSize: 2, hours: 1 })).toBe(10000);
    expect(groupSurcharge({ groupSize: 3, hours: 1.5 })).toBe(30000);
    expect(groupSurcharge({ groupSize: 6, hours: 2 })).toBe(100000);
  });

  it('reads garbage as an individual session', () => {
    expect(groupSurcharge({ groupSize: 'abc', hours: 1 })).toBe(0);
    expect(groupSurcharge({ groupSize: 2.5, hours: 1 })).toBe(0);
    expect(groupSurcharge({ groupSize: 3, hours: 0 })).toBe(0);
    expect(normalizeGroupSize(-4)).toBe(1);
  });
});

describe('tutor limit', () => {
  it('defaults to 6 and honours the tutor setting', () => {
    expect(maxGroupSizeOf(null)).toBe(GROUP_MAX_SIZE);
    expect(maxGroupSizeOf({ maxGroupSize: 1 })).toBe(1);
    expect(maxGroupSizeOf({ maxGroupSize: 4 })).toBe(4);
    expect(maxGroupSizeOf({ maxGroupSize: 9 })).toBe(GROUP_MAX_SIZE);
  });

  it('accepts sizes up to the limit and never above 6', () => {
    expect(isAllowedGroupSize(1, 1)).toBe(true);
    expect(isAllowedGroupSize(2, 1)).toBe(false);
    expect(isAllowedGroupSize(6, 6)).toBe(true);
    expect(isAllowedGroupSize(7, 99)).toBe(false);
    expect(isAllowedGroupSize(0, 6)).toBe(false);
  });
});

describe('cleanInviteEmails', () => {
  const options = { maxGuests: 2, exclude: ['Me@Uniandes.edu.co'] };

  it('trims, lowercases and skips empty rows', () => {
    expect(cleanInviteEmails([' Ana@Test.co ', '', null], options)).toEqual({ emails: ['ana@test.co'], error: null });
  });

  it('refuses invalid, repeated, own and surplus emails', () => {
    expect(cleanInviteEmails(['not-an-email'], options).error).toBe('INVITE_INVALID_EMAIL');
    expect(cleanInviteEmails(['a@b.co', 'A@B.CO'], options).error).toBe('INVITE_DUPLICATE');
    expect(cleanInviteEmails(['me@uniandes.edu.co'], options).error).toBe('INVITE_SELF');
    expect(cleanInviteEmails(['a@b.co', 'c@d.co', 'e@f.co'], options).error).toBe('INVITE_TOO_MANY');
    expect(cleanInviteEmails('a@b.co', options).error).toBe('INVITE_INVALID_EMAIL');
  });

  it('treats no list as no guests', () => {
    expect(cleanInviteEmails(undefined, options)).toEqual({ emails: [], error: null });
  });
});

describe('intent snapshot', () => {
  it('adds nothing for an individual booking and reads legacy intents as individual', () => {
    expect(buildGroupSnapshot({ groupSize: 1, groupSurcharge: 0 })).toEqual({});
    expect(readGroupSnapshot({ studentId: 's1' })).toEqual({ groupSize: 1, groupSurcharge: 0, inviteEmails: [] });
    expect(readGroupSnapshot(undefined)).toEqual({ groupSize: 1, groupSurcharge: 0, inviteEmails: [] });
  });

  it('round-trips a group booking as strings', () => {
    const snapshot = buildGroupSnapshot({ groupSize: 3, groupSurcharge: 20000, inviteEmails: ['a@b.co', 'c@d.co'] });
    expect(snapshot).toEqual({ groupSize: '3', groupSurcharge: '20000', inviteEmails: '["a@b.co","c@d.co"]' });
    expect(readGroupSnapshot(snapshot)).toEqual({ groupSize: 3, groupSurcharge: 20000, inviteEmails: ['a@b.co', 'c@d.co'] });
  });

  it('never trusts more guests than seats, nor a size above 6', () => {
    const read = readGroupSnapshot({
      groupSize: '99',
      groupSurcharge: '-5',
      inviteEmails: JSON.stringify(['a@b.co', 'a@b.co', 'x', 'c@d.co', 'e@f.co', 'g@h.co', 'i@j.co', 'k@l.co']),
    });
    expect(read.groupSize).toBe(GROUP_MAX_SIZE);
    expect(read.groupSurcharge).toBe(0);
    expect(read.inviteEmails).toHaveLength(GROUP_MAX_SIZE - 1);
    expect(readGroupSnapshot({ groupSize: '2', inviteEmails: '{broken' }).inviteEmails).toEqual([]);
  });
});

describe('organizerIdOf', () => {
  it('is whoever paid, else the first participant', () => {
    expect(organizerIdOf({ payments: [{ studentId: 'payer' }], participants: [{ studentId: 'first' }] })).toBe('payer');
    expect(organizerIdOf({ payments: [], participants: [{ studentId: 'first' }] })).toBe('first');
    expect(organizerIdOf(null)).toBeNull();
  });
});

describe('withSurcharge (coupons never discount the group surcharge)', () => {
  const percent = (value, absorber = 'CALICO') => ({ discountType: 'PERCENT', discountValue: value, absorber });

  it('leaves a pricing without surcharge untouched', () => {
    const pricing = noCouponPricing(50000);
    expect(withSurcharge(pricing, 0)).toBe(pricing);
  });

  it('adds the surcharge to list price, charge and tutor base, not to the discount', () => {
    const pricing = withSurcharge(applyCoupon({ coupon: percent(10), originalAmount: 50000 }), 20000);
    expect(pricing).toMatchObject({
      originalAmount: 70000, discountAmount: 5000, finalAmount: 65000, tutorPayoutBase: 70000,
    });
  });

  it('keeps a shared coupon sharing only the base discount', () => {
    const pricing = withSurcharge(applyCoupon({ coupon: percent(10, 'SHARED'), originalAmount: 50000 }), 20000);
    expect(pricing).toMatchObject({ finalAmount: 65000, tutorPayoutBase: 65000 });
  });

  it('makes a 100 % coupon charge the surcharge instead of booking for free', () => {
    const free = applyCoupon({ coupon: percent(100), originalAmount: 50000 });
    expect(isFreePricing(free)).toBe(true);
    const group = withSurcharge(free, 20000);
    expect(isFreePricing(group)).toBe(false);
    expect(group).toMatchObject({ originalAmount: 70000, discountAmount: 50000, finalAmount: 20000, tutorPayoutBase: 70000 });
  });
});
