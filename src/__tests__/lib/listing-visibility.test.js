/**
 * @jest-environment node
 *
 * Regla "¿este tutor aparece para los estudiantes?" —
 * src/lib/availability/listing-visibility.js
 */

const {
  startOfTodayAsDbDate,
  futureAvailabilityWhere,
  listingCandidateWhere,
  hasBookableFutureBlocks,
  deriveIsListed,
  isHiddenFromStudents,
} = require('@/lib/availability/listing-visibility');

describe('startOfTodayAsDbDate', () => {
  it('returns UTC midnight of the civil date in the given timezone', () => {
    // 2026-09-10 02:30 UTC is still 2026-09-09 in Bogotá (UTC-5)
    const now = new Date('2026-09-10T02:30:00.000Z');
    expect(startOfTodayAsDbDate(now, 'America/Bogota').toISOString()).toBe('2026-09-09T00:00:00.000Z');
    expect(startOfTodayAsDbDate(now, 'UTC').toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });
});

describe('futureAvailabilityWhere', () => {
  it('matches recurring blocks or specific dates from today on', () => {
    const today = new Date('2026-09-10T00:00:00.000Z');
    expect(futureAvailabilityWhere(today)).toEqual({
      OR: [
        { recurring: true },
        { specificDate: { gte: today } },
      ],
    });
  });
});

describe('listingCandidateWhere (paso 1, pre-filtro en BD)', () => {
  it('requires approved + active and at least one future block, honouring busy sync mode', () => {
    const today = new Date('2026-09-10T00:00:00.000Z');
    const where = listingCandidateWhere(today);

    expect(where.isTutorApproved).toBe(true);
    expect(where.isActive).toBe(true);
    expect(where.OR).toHaveLength(4);

    // Without a schedule, any future block counts.
    expect(where.OR[0]).toEqual({
      schedule: null,
      availabilities: { some: futureAvailabilityWhere(today) },
    });

    // In "busy" mode only calendar_sync blocks are published.
    const busyBranch = where.OR[3];
    expect(busyBranch.schedule).toEqual({ calendarSyncMode: 'busy' });
    expect(busyBranch.availabilities.some.source).toBe('calendar_sync');
  });
});

describe('hasBookableFutureBlocks', () => {
  it('is false with no future blocks', () => {
    expect(hasBookableFutureBlocks([], null)).toBe(false);
    expect(hasBookableFutureBlocks(undefined, null)).toBe(false);
  });

  it('is true with any block in "available" mode (default)', () => {
    expect(hasBookableFutureBlocks([{ source: 'manual' }], null)).toBe(true);
    expect(hasBookableFutureBlocks([{ source: 'manual' }], { calendarSyncMode: 'available' })).toBe(true);
  });

  it('ignores manual base blocks in "busy" mode', () => {
    const busy = { calendarSyncMode: 'busy' };
    expect(hasBookableFutureBlocks([{ source: 'manual' }], busy)).toBe(false);
    expect(hasBookableFutureBlocks([{ source: 'manual' }, { source: 'calendar_sync' }], busy)).toBe(true);
  });
});

describe('deriveIsListed (paso 2, horas libres mínimas)', () => {
  const minListingMinutes = 180; // 3 h

  it('is false without bookable blocks, whatever the minutes', () => {
    expect(deriveIsListed({ hasBookableBlocks: false, minutes: 600, minListingMinutes })).toBe(false);
  });

  it('is false with zero or too few free minutes', () => {
    expect(deriveIsListed({ hasBookableBlocks: true, minutes: 0, minListingMinutes })).toBe(false);
    expect(deriveIsListed({ hasBookableBlocks: true, minutes: 179, minListingMinutes })).toBe(false);
  });

  it('is true from exactly the minimum upwards', () => {
    expect(deriveIsListed({ hasBookableBlocks: true, minutes: 180, minListingMinutes })).toBe(true);
    expect(deriveIsListed({ hasBookableBlocks: true, minutes: 600, minListingMinutes })).toBe(true);
  });
});

describe('isHiddenFromStudents', () => {
  it('is true only when the status object explicitly says isListed === false', () => {
    expect(isHiddenFromStudents({ isListed: false })).toBe(true);
    expect(isHiddenFromStudents({ isListed: true })).toBe(false);
    expect(isHiddenFromStudents({})).toBe(false);
    expect(isHiddenFromStudents(null)).toBe(false);
    expect(isHiddenFromStudents(undefined)).toBe(false);
  });
});
