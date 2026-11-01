/**
 * Unit tests — review.repository, reviews shown on a tutor's profile.
 *
 * A finished tutoring session leaves a `pending` placeholder review (no
 * rating yet). Once the student rates it the row becomes `done` with the
 * rating and the optional comment, and only then may it reach the tutor's
 * profile (GET /api/tutors/[id]/reviews → TutorReviewsSection → ReviewCard).
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    review: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const prisma = require('@/lib/prisma').default;
const repo = require('@/lib/repositories/review.repository');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.review.findMany.mockResolvedValue([]);
  prisma.review.count.mockResolvedValue(0);
});

describe('findReviewsReceivedPaginated (tutor profile)', () => {
  it('only returns submitted (done) reviews of that tutor and counts the same set', async () => {
    const done = { id: 'r1', rating: 5, comment: 'Explica muy claro', status: 'done' };
    prisma.review.findMany.mockResolvedValue([done]);
    prisma.review.count.mockResolvedValue(1);

    const out = await repo.findReviewsReceivedPaginated('tutor-1', { limit: 6, offset: 0 });

    expect(out).toEqual({ items: [done], total: 1 });
    const query = prisma.review.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ tutorId: 'tutor-1', status: 'done' });
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { tutorId: 'tutor-1', status: 'done' } });
  });

  it('selects what the review card shows: the comment comes with the row, plus the student and the course or event', async () => {
    await repo.findReviewsReceivedPaginated('tutor-1');

    const { include, select } = prisma.review.findMany.mock.calls[0][0];
    expect(select).toBeUndefined(); // every scalar (rating, comment) is returned
    expect(include.student).toEqual({ select: { id: true, name: true, profilePictureUrl: true } });
    expect(include.course).toBeDefined();
    expect(include.event).toBeDefined();
  });

  it('"recent" is by when the student rated, undated reviews last, with a stable tiebreak', async () => {
    await repo.findReviewsReceivedPaginated('tutor-1');

    expect(prisma.review.findMany.mock.calls[0][0].orderBy).toEqual([
      { submittedAt: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('keeps the done filter when narrowing to one course', async () => {
    await repo.findReviewsReceivedPaginated('tutor-1', { courseId: 'c1' });

    expect(prisma.review.findMany.mock.calls[0][0].where).toEqual({ tutorId: 'tutor-1', status: 'done', courseId: 'c1' });
  });
});
