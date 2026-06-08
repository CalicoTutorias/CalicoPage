/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/payments/pricing.js`.
 *
 * Pricing is per-hour and centralized per course (CoursePrice overrides
 * basePrice); the charge is price/hour × session length. These tests pin down
 * that multiplication (incl. the multi-hour case that motivated the fix),
 * the Decimal coercion, and every PricingError branch.
 */

jest.mock('@/lib/repositories/academic.repository', () => ({
  findCourseById: jest.fn(),
}));

const { findCourseById } = require('@/lib/repositories/academic.repository');
const {
  pricePerHour,
  sessionDurationHours,
  computeSessionAmount,
  resolveSessionAmount,
  PricingError,
} = require('@/lib/payments/pricing');

beforeEach(() => {
  jest.clearAllMocks();
});

// 1-hour and 2-hour windows reused across tests.
const start = new Date('2026-05-03T13:00:00.000Z');
const oneHourEnd = new Date('2026-05-03T14:00:00.000Z');
const twoHourEnd = new Date('2026-05-03T15:00:00.000Z');
const ninetyMinEnd = new Date('2026-05-03T14:30:00.000Z');

describe('pricePerHour', () => {
  it('uses the centralized CoursePrice when present (overrides basePrice)', () => {
    expect(pricePerHour({ basePrice: 50000, coursePrice: { price: 55000 } })).toBe(55000);
  });

  it('falls back to basePrice when there is no CoursePrice', () => {
    expect(pricePerHour({ basePrice: 45000, coursePrice: null })).toBe(45000);
  });

  it('coerces Prisma Decimal-like values to numbers', () => {
    expect(pricePerHour({ basePrice: { toString: () => '40000' } })).toBe(40000);
  });

  it('throws NO_PRICE when neither price is a positive number', () => {
    expect(() => pricePerHour({ basePrice: null, coursePrice: null }))
      .toThrow(expect.objectContaining({ code: 'NO_PRICE' }));
    expect(() => pricePerHour({ basePrice: 0 }))
      .toThrow(expect.objectContaining({ code: 'NO_PRICE' }));
  });
});

describe('sessionDurationHours', () => {
  it('returns whole hours for an exact window', () => {
    expect(sessionDurationHours(start, twoHourEnd)).toBe(2);
  });

  it('returns fractional hours for a 90-minute window', () => {
    expect(sessionDurationHours(start, ninetyMinEnd)).toBe(1.5);
  });

  it('accepts ISO strings as well as Date objects', () => {
    expect(sessionDurationHours(start.toISOString(), oneHourEnd.toISOString())).toBe(1);
  });

  it('throws BAD_INTERVAL for a non-positive or invalid interval', () => {
    expect(() => sessionDurationHours(twoHourEnd, start))
      .toThrow(expect.objectContaining({ code: 'BAD_INTERVAL' }));
    expect(() => sessionDurationHours('nope', oneHourEnd))
      .toThrow(expect.objectContaining({ code: 'BAD_INTERVAL' }));
  });
});

describe('computeSessionAmount', () => {
  it('charges price/hour × hours — a 2-hour booking is double', () => {
    const course = { basePrice: 40000 };
    expect(computeSessionAmount({ course, startTimestamp: start, endTimestamp: oneHourEnd })).toBe(40000);
    expect(computeSessionAmount({ course, startTimestamp: start, endTimestamp: twoHourEnd })).toBe(80000);
  });

  it('prices a 90-minute session at 1.5× the hourly rate', () => {
    expect(
      computeSessionAmount({ course: { basePrice: 40000 }, startTimestamp: start, endTimestamp: ninetyMinEnd }),
    ).toBe(60000);
  });

  it('rounds to the nearest COP', () => {
    // 33333/h × 1.5h = 49999.5 → 50000
    expect(
      computeSessionAmount({ course: { basePrice: 33333 }, startTimestamp: start, endTimestamp: ninetyMinEnd }),
    ).toBe(50000);
  });
});

describe('resolveSessionAmount', () => {
  it('loads the course and returns the authoritative amount + breakdown', async () => {
    findCourseById.mockResolvedValue({ id: 'c1', basePrice: 40000, coursePrice: null });

    const result = await resolveSessionAmount({
      courseId: 'c1',
      startTimestamp: start,
      endTimestamp: twoHourEnd,
    });

    expect(findCourseById).toHaveBeenCalledWith('c1');
    expect(result).toEqual({ amount: 80000, pricePerHour: 40000, hours: 2 });
  });

  it('prefers the centralized CoursePrice over basePrice', async () => {
    findCourseById.mockResolvedValue({ id: 'c1', basePrice: 40000, coursePrice: { price: 60000 } });

    const result = await resolveSessionAmount({
      courseId: 'c1',
      startTimestamp: start,
      endTimestamp: oneHourEnd,
    });

    expect(result.amount).toBe(60000);
    expect(result.pricePerHour).toBe(60000);
  });

  it('throws MISSING_COURSE when no courseId is given', async () => {
    await expect(
      resolveSessionAmount({ courseId: null, startTimestamp: start, endTimestamp: oneHourEnd }),
    ).rejects.toMatchObject({ name: 'PricingError', code: 'MISSING_COURSE' });
    expect(findCourseById).not.toHaveBeenCalled();
  });

  it('throws COURSE_NOT_FOUND when the course does not exist', async () => {
    findCourseById.mockResolvedValue(null);
    await expect(
      resolveSessionAmount({ courseId: 'ghost', startTimestamp: start, endTimestamp: oneHourEnd }),
    ).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' });
  });

  it('propagates NO_PRICE for a course without a valid price', async () => {
    findCourseById.mockResolvedValue({ id: 'c1', basePrice: null, coursePrice: null });
    await expect(
      resolveSessionAmount({ courseId: 'c1', startTimestamp: start, endTimestamp: oneHourEnd }),
    ).rejects.toMatchObject({ code: 'NO_PRICE' });
  });

  it('exports a PricingError class', () => {
    expect(new PricingError('x', 'NO_PRICE')).toBeInstanceOf(Error);
  });
});
