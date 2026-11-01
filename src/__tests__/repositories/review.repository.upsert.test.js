/** @jest-environment node */
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    review: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    session: { findUnique: jest.fn() },
  },
}));
const prisma = require('@/lib/prisma').default;
const repo = require('@/lib/repositories/review.repository');

beforeEach(() => jest.clearAllMocks());

it('refuses to upsert without a sessionId (no wildcard match on student+tutor)', async () => {
  await expect(repo.upsertReview({ studentId: 's', tutorId: 't', rating: 5 })).rejects.toMatchObject({ code: 'SESSION_REQUIRED' });
  expect(prisma.review.findFirst).not.toHaveBeenCalled();
});

it('never downgrades a done review back to pending', async () => {
  prisma.review.findFirst.mockResolvedValue({ id: 'r1', status: 'done', rating: 5 });
  prisma.review.update.mockResolvedValue({ id: 'r1' });
  await repo.upsertReview({ sessionId: 'x', studentId: 's', tutorId: 't', status: 'pending', rating: null });
  expect(prisma.review.update.mock.calls[0][0].data.status).toBeUndefined();
});

it('still allows pending → done', async () => {
  prisma.review.findFirst.mockResolvedValue({ id: 'r1', status: 'pending', rating: null });
  prisma.review.update.mockResolvedValue({ id: 'r1' });
  await repo.upsertReview({ sessionId: 'x', studentId: 's', tutorId: 't', status: 'done', rating: 4 });
  expect(prisma.review.update.mock.calls[0][0].data).toMatchObject({ status: 'done', rating: 4 });
});

describe('submittedAt: when the student rated', () => {
  const FROZEN = new Date('2026-11-01T20:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: FROZEN });
    prisma.review.update.mockResolvedValue({ id: 'r1' });
    prisma.review.create.mockResolvedValue({ id: 'r1' });
  });
  afterEach(() => jest.useRealTimers());

  const session = { sessionId: 'x', studentId: 's', tutorId: 't', courseId: 'c' };

  it('is set when a placeholder is rated', async () => {
    prisma.review.findFirst.mockResolvedValue({ id: 'r1', status: 'pending', rating: null });
    await repo.upsertReview({ ...session, status: 'done', rating: 4 });
    expect(prisma.review.update.mock.calls[0][0].data.submittedAt).toEqual(FROZEN);
  });

  it('does not move when the student edits a review already rated', async () => {
    prisma.review.findFirst.mockResolvedValue({ id: 'r1', status: 'done', rating: 5 });
    await repo.upsertReview({ ...session, status: 'done', rating: 3 });
    expect(prisma.review.update.mock.calls[0][0].data.submittedAt).toBeUndefined();
  });

  it('does not move when a placeholder is re-created over a rated review', async () => {
    prisma.review.findFirst.mockResolvedValue({ id: 'r1', status: 'done', rating: 5 });
    await repo.upsertReview({ ...session, status: 'pending', rating: null });
    expect(prisma.review.update.mock.calls[0][0].data.submittedAt).toBeUndefined();
  });

  it('stays empty on a new placeholder and is set on a review created already rated', async () => {
    prisma.review.findFirst.mockResolvedValue(null);
    await repo.upsertReview({ ...session, status: 'pending', rating: null });
    expect(prisma.review.create.mock.calls[0][0].data.submittedAt).toBeNull();

    await repo.upsertReview({ ...session, status: 'done', rating: 5 });
    expect(prisma.review.create.mock.calls[1][0].data.submittedAt).toEqual(FROZEN);
  });
});
