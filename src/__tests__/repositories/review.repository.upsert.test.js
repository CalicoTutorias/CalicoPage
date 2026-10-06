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
