process.env.TZ = 'Asia/Tokyo';
const f = require('@/lib/utils/event-format');

it('parses a Bogotá wall-clock input as UTC−5 regardless of the machine zone', () => {
  expect(f.bogotaLocalToUtc('2026-10-18T18:00').toISOString()).toBe('2026-10-18T23:00:00.000Z');
});
it('round-trips to the input format', () => {
  expect(f.utcToBogotaLocalInput(new Date('2026-10-18T23:00:00.000Z'))).toBe('2026-10-18T18:00');
});
it('formats date and time range in Bogotá', () => {
  const start = new Date('2026-10-18T23:00:00.000Z');
  const end = new Date('2026-10-19T01:00:00.000Z');
  expect(f.formatEventDate(start)).toBe('domingo, 18 de octubre');
  expect(f.formatEventTimeRange(start, end)).toMatch(/^6:00\s?p\.\s?m\. – 8:00\s?p\.\s?m\.$/);
});
it('joins names per locale', () => {
  expect(f.joinNames(['Ana'])).toBe('Ana');
  expect(f.joinNames(['Ana', 'Luis'])).toBe('Ana y Luis');
  expect(f.joinNames(['Ana', 'Luis', 'Sara'])).toBe('Ana, Luis y Sara');
  expect(f.joinNames(['Ana', 'Luis'], 'en')).toBe('Ana and Luis');
});
it('rejects malformed local input', () => {
  expect(() => f.bogotaLocalToUtc('18/10/2026')).toThrow();
});
it('picks the One sibling key only for a count of exactly 1', () => {
  expect(f.countKey('events.common.earlyBirdLeft', 1)).toBe('events.common.earlyBirdLeftOne');
  expect(f.countKey('events.common.earlyBirdLeft', '1')).toBe('events.common.earlyBirdLeftOne');
  expect(f.countKey('events.common.earlyBirdLeft', 0)).toBe('events.common.earlyBirdLeft');
  expect(f.countKey('events.common.earlyBirdLeft', 2)).toBe('events.common.earlyBirdLeft');
});
