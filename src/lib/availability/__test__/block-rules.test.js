import { mergeContiguousRanges, fitsInRanges, meetsBookingNotice, blockHours } from '../block-rules';

const t = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m));

describe('block rules', () => {
  it('merges back-to-back and overlapping ranges', () => {
    const merged = mergeContiguousRanges([
      { start: t(15), end: t(16) },
      { start: t(9), end: t(11) },
      { start: t(11), end: t(12) },
      { start: t(14), end: t(15, 30) },
    ]);
    expect(merged).toEqual([{ start: t(9), end: t(12) }, { start: t(14), end: t(16) }]);
  });

  it('fits a block only when it is inside one continuous window', () => {
    const ranges = [{ start: t(9), end: t(11) }, { start: t(11), end: t(13) }];
    expect(fitsInRanges(t(10), t(13), ranges)).toBe(true);
    expect(fitsInRanges(t(12), t(14), ranges)).toBe(false);
  });

  it('checks the minimum notice', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(meetsBookingNotice(new Date('2026-11-17T18:00:00Z'), 6, now)).toBe(true);
    expect(meetsBookingNotice(new Date('2026-11-17T17:59:00Z'), 6, now)).toBe(false);
    expect(meetsBookingNotice(new Date('2026-11-17T12:30:00Z'), 0, now)).toBe(true);
  });

  it('counts whole hours only', () => {
    expect(blockHours(t(10), t(13))).toBe(3);
    expect(blockHours(t(10), t(11, 30))).toBeNull();
  });
});
