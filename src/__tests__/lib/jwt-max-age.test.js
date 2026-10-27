/** @jest-environment node */
const ORIGINAL_ENV = process.env;

beforeEach(() => { jest.resetModules(); process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'test-secret' }; });
afterAll(() => { process.env = ORIGINAL_ENV; });

function load() { return require('@/lib/auth/jwt'); }

describe('tokenMaxAgeSeconds (auth cookie lifetime = JWT lifetime)', () => {
  it.each([
    ['7d', 7 * 86400],
    ['1h', 3600],
    ['30m', 1800],
    ['45s', 45],
    ['2w', 2 * 604800],
    ['3600', 3600],
    [' 12H ', 12 * 3600],
  ])('parses %s as %i seconds', (value, seconds) => {
    expect(load().tokenMaxAgeSeconds(value)).toBe(seconds);
  });

  it('defaults to JWT_EXPIRATION from the environment', () => {
    process.env.JWT_EXPIRATION = '7d';
    expect(load().tokenMaxAgeSeconds()).toBe(7 * 86400);
  });

  it('rejects formats jsonwebtoken would not sign with', () => {
    expect(() => load().tokenMaxAgeSeconds('soon')).toThrow(/JWT_EXPIRATION/);
    expect(() => load().tokenMaxAgeSeconds('')).toThrow(/JWT_EXPIRATION/);
  });

  it('matches the exp claim jsonwebtoken puts in the signed token', () => {
    process.env.JWT_EXPIRATION = '7d';
    const { signToken, tokenMaxAgeSeconds } = load();
    const token = signToken({ id: 'u1', email: 'a@b.c', role: 'STUDENT' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(tokenMaxAgeSeconds());
  });
});
