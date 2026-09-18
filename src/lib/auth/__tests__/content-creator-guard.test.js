/**
 * @jest-environment node
 *
 * requireContentCreator: personal tokens for the content-creator tool.
 * Security invariants: only the SHA-256 is looked up, revoked tokens and
 * non-admin / disabled owners never pass, and the rate limit applies.
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null) }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { contentCreatorToken: { findUnique: jest.fn(), update: jest.fn() } },
}));

const { NextResponse } = require('next/server');
const { rateLimit } = require('@/lib/auth/rateLimit');
const prisma = require('@/lib/prisma').default;
const { requireContentCreator, hashContentToken } = require('@/lib/auth/guards');

const TOKEN = `cct_${'a'.repeat(64)}`;
const req = (auth) => new Request('http://localhost/api/content-creator/pieces', {
  headers: auth ? { authorization: auth } : {},
});
const row = (overrides = {}) => ({
  id: 'tok-1',
  revokedAt: null,
  lastUsedAt: null,
  user: { id: 'u-1', email: 'felipe@calico.co', name: 'Felipe', role: 'ADMIN', isActive: true },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  rateLimit.mockReturnValue(null);
  prisma.contentCreatorToken.update.mockResolvedValue({});
});

it('test_should_reject_missing_or_foreign_tokens_without_db_lookup', async () => {
  for (const auth of [null, 'Bearer abc', 'Basic cct_x', TOKEN]) {
    const res = await requireContentCreator(req(auth));
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(401);
  }
  expect(prisma.contentCreatorToken.findUnique).not.toHaveBeenCalled();
});

it('test_should_look_up_only_the_sha256_of_the_token', async () => {
  prisma.contentCreatorToken.findUnique.mockResolvedValue(row());
  await requireContentCreator(req(`Bearer ${TOKEN}`));
  const { where } = prisma.contentCreatorToken.findUnique.mock.calls[0][0];
  expect(where).toEqual({ tokenHash: hashContentToken(TOKEN) });
  expect(where.tokenHash).not.toContain(TOKEN);
});

it('test_should_return_the_admin_identity_and_touch_last_used', async () => {
  prisma.contentCreatorToken.findUnique.mockResolvedValue(row());
  const actor = await requireContentCreator(req(`Bearer ${TOKEN}`));
  expect(actor).toEqual({ sub: 'u-1', email: 'felipe@calico.co', name: 'Felipe', role: 'ADMIN', tokenId: 'tok-1' });
  expect(prisma.contentCreatorToken.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'tok-1' } }));
});

it('test_should_not_touch_last_used_more_than_once_a_minute', async () => {
  prisma.contentCreatorToken.findUnique.mockResolvedValue(row({ lastUsedAt: new Date() }));
  await requireContentCreator(req(`Bearer ${TOKEN}`));
  expect(prisma.contentCreatorToken.update).not.toHaveBeenCalled();
});

it.each([
  ['unknown token', null, 401],
  ['revoked token', row({ revokedAt: new Date() }), 401],
  ['disabled owner', row({ user: { ...row().user, isActive: false } }), 403],
  ['owner no longer admin', row({ user: { ...row().user, role: 'STUDENT' } }), 403],
])('test_should_reject_%s', async (_label, found, status) => {
  prisma.contentCreatorToken.findUnique.mockResolvedValue(found);
  const res = await requireContentCreator(req(`Bearer ${TOKEN}`));
  expect(res.status).toBe(status);
});

it('test_should_apply_the_rate_limit_per_token', async () => {
  prisma.contentCreatorToken.findUnique.mockResolvedValue(row());
  rateLimit.mockReturnValue(NextResponse.json({}, { status: 429 }));
  const res = await requireContentCreator(req(`Bearer ${TOKEN}`));
  expect(res.status).toBe(429);
  expect(rateLimit).toHaveBeenCalledWith('content-creator:tok-1', expect.any(Object));
});
