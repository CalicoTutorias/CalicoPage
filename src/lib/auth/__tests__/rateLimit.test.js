/**
 * @jest-environment node
 *
 * Unit tests for `src/lib/auth/rateLimit.js` (in-memory token bucket) and the
 * getClientIp helper.
 *
 * The bucket Map is module-level and persists between tests, so each test uses
 * a unique key to stay isolated. Time is driven through a mocked Date.now() so
 * the window-expiry behaviour is deterministic instead of sleep-based.
 */

const { NextResponse } = require('next/server');
const { rateLimit, getClientIp } = require('@/lib/auth/rateLimit');

let now;
beforeEach(() => {
  now = 1_700_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('rateLimit', () => {
  it('allows the first request and returns null', () => {
    expect(rateLimit('first-call')).toBeNull();
  });

  it('allows requests up to the max, then blocks with a 429', async () => {
    const key = 'burst';
    const opts = { max: 3, windowMs: 60_000 };

    expect(rateLimit(key, opts)).toBeNull(); // 1
    expect(rateLimit(key, opts)).toBeNull(); // 2
    expect(rateLimit(key, opts)).toBeNull(); // 3 (== max, still allowed)

    const blocked = rateLimit(key, opts); // 4 → over the limit
    expect(blocked).toBeInstanceOf(NextResponse);
    expect(blocked.status).toBe(429);

    const json = await blocked.json();
    expect(json).toMatchObject({ success: false, error: 'RATE_LIMITED' });
    expect(json.message).toMatch(/Demasiadas peticiones/);
  });

  it('sets Retry-After and X-RateLimit headers on the 429', () => {
    const key = 'headers';
    const opts = { max: 1, windowMs: 60_000 };
    rateLimit(key, opts);
    const blocked = rateLimit(key, opts);

    expect(blocked.headers.get('Retry-After')).toBe('60');
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('resets the bucket once the window has elapsed', () => {
    const key = 'window';
    const opts = { max: 1, windowMs: 60_000 };

    expect(rateLimit(key, opts)).toBeNull();      // allowed
    expect(rateLimit(key, opts)).not.toBeNull();  // blocked within window

    now += 60_001; // jump just past the window
    expect(rateLimit(key, opts)).toBeNull();      // fresh bucket → allowed again
  });

  it('keeps separate counters per key', () => {
    const opts = { max: 1, windowMs: 60_000 };
    expect(rateLimit('user-a', opts)).toBeNull();
    expect(rateLimit('user-b', opts)).toBeNull(); // different key, unaffected
    expect(rateLimit('user-a', opts)).not.toBeNull(); // user-a now blocked
  });

  it('defaults to max 30 per minute when no options are given', () => {
    const key = 'defaults';
    for (let i = 0; i < 30; i++) {
      expect(rateLimit(key)).toBeNull();
    }
    expect(rateLimit(key)).not.toBeNull(); // 31st is blocked
  });
});

describe('getClientIp', () => {
  const req = (headers) => new Request('http://localhost/', { headers });

  it('uses the first IP from x-forwarded-for and trims it', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })))
      .toBe('203.0.113.7');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    expect(getClientIp(req({ 'x-real-ip': '198.51.100.5' }))).toBe('198.51.100.5');
  });

  it('falls back to "unknown" when no IP headers are present', () => {
    expect(getClientIp(req({}))).toBe('unknown');
  });
});
