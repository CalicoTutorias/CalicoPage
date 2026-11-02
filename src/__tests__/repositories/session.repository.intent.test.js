/**
 * Unit tests — session.repository.findSessionByIntentReference
 *
 * A paid booking is stamped with `Booked via payment intent <reference>`; the
 * lookup must match that exact note, skip canceled/rejected sessions and
 * return the same shape as findById.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

const prisma = require('@/lib/prisma').default;
const repo = require('@/lib/repositories/session.repository');

beforeEach(() => jest.clearAllMocks());

describe('findSessionByIntentReference', () => {
  it('matches the exact payment-intent note of an active session, with the findById include', async () => {
    const session = { id: 'sess-1' };
    prisma.session.findFirst.mockResolvedValue(session);

    await expect(repo.findSessionByIntentReference('TXN-1')).resolves.toBe(session);

    const args = prisma.session.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({
      notes: 'Booked via payment intent TXN-1',
      status: { notIn: ['Canceled', 'Rejected'] },
    });

    await repo.findById('sess-1');
    expect(args.include).toEqual(prisma.session.findUnique.mock.calls[0][0].include);
  });

  it('returns null without querying for an empty reference', async () => {
    await expect(repo.findSessionByIntentReference('')).resolves.toBeNull();
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
  });
});
