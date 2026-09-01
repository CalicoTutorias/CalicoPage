/**
 * Tests for the returnTo sanitizer — the guard that keeps the post-auth
 * redirect from becoming an open redirect. Every accepted value must be a
 * same-origin path; every rejection returns null (callers fall back to HOME).
 */

import { sanitizeReturnTo, withReturnTo } from '@/lib/utils/returnTo';

describe('sanitizeReturnTo', () => {
  it('accepts a plain internal path', () => {
    expect(sanitizeReturnTo('/home/buscar-tutores')).toBe('/home/buscar-tutores');
  });

  it('accepts an internal path with query params (booking URL)', () => {
    const url =
      '/home/agendar?tutorId=abc-123&start=2026-09-01T14%3A00%3A00.000Z&courseId=xyz';
    expect(sanitizeReturnTo(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeReturnTo('  /home/history  ')).toBe('/home/history');
  });

  it('drops URL fragments', () => {
    expect(sanitizeReturnTo('/home/profile#section')).toBe('/home/profile');
  });

  it('rejects absolute external URLs', () => {
    expect(sanitizeReturnTo('https://evil.com/phish')).toBeNull();
    expect(sanitizeReturnTo('http://evil.com')).toBeNull();
  });

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeReturnTo('//evil.com/phish')).toBeNull();
  });

  it('rejects inputs that NORMALIZE into a protocol-relative path', () => {
    // These start with a single "/" (so the raw-input guard passes) but the
    // URL parser collapses them to a "//evil.com" pathname → off-origin.
    expect(sanitizeReturnTo('/..//evil.com')).toBeNull();
    expect(sanitizeReturnTo('/.//evil.com')).toBeNull();
    expect(sanitizeReturnTo('/..//..//evil.com')).toBeNull();
    expect(sanitizeReturnTo('/../..//evil.com')).toBeNull();
  });

  it('still resolves legitimate ".." segments to a same-origin path', () => {
    expect(sanitizeReturnTo('/foo/../bar')).toBe('/bar');
  });

  it('rejects backslash host-smuggling variants', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBeNull();
    expect(sanitizeReturnTo('\\/evil.com')).toBeNull();
    expect(sanitizeReturnTo('/home\\..\\x')).toBeNull();
  });

  it('rejects scheme-based payloads', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBeNull();
    expect(sanitizeReturnTo('data:text/html,x')).toBeNull();
  });

  it('rejects paths back into the auth flow (redirect loops)', () => {
    expect(sanitizeReturnTo('/auth/login')).toBeNull();
    expect(sanitizeReturnTo('/auth/login?returnTo=%2Fhome')).toBeNull();
  });

  it('rejects non-strings, empty strings and oversized values', () => {
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
    expect(sanitizeReturnTo(42)).toBeNull();
    expect(sanitizeReturnTo('')).toBeNull();
    expect(sanitizeReturnTo(`/${'a'.repeat(3000)}`)).toBeNull();
  });

  it('rejects relative paths that do not start with "/"', () => {
    expect(sanitizeReturnTo('home/agendar')).toBeNull();
    expect(sanitizeReturnTo('../etc')).toBeNull();
  });
});

describe('withReturnTo', () => {
  it('appends an encoded returnTo to a route', () => {
    expect(withReturnTo('/auth/login', '/home/agendar?tutorId=1')).toBe(
      '/auth/login?returnTo=%2Fhome%2Fagendar%3FtutorId%3D1',
    );
  });

  it('uses "&" when the route already has a query string', () => {
    expect(withReturnTo('/auth/login?foo=1', '/home/history')).toBe(
      '/auth/login?foo=1&returnTo=%2Fhome%2Fhistory',
    );
  });

  it('returns the route untouched when the target is unsafe or absent', () => {
    expect(withReturnTo('/auth/login', 'https://evil.com')).toBe('/auth/login');
    expect(withReturnTo('/auth/login', null)).toBe('/auth/login');
  });
});
