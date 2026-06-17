/**
 * @jest-environment node
 *
 * GET /api/admin/users/:userId/student-reviews — admin moderation of the
 * tutor→student reviews received by a user, with a materia filter resolved
 * through the session→course relation (NO denormalized course column).
 *
 * Verifies:
 *  - requireAdminUser gates the route (only admins read the comment text).
 *  - The response carries reviews (incl. comments) + distinct courses.
 *  - The materia filter is applied as a relation filter (`session.courseId`),
 *    proving the model stays normalized.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    studentReview: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));

const { NextResponse } = require('next/server');
const prisma = require('@/lib/prisma').default;
const { requireAdminUser } = require('@/lib/auth/guards');

const ADMIN = { sub: 'admin-1', email: 'admin@test.co', role: 'ADMIN' };

let GET;
beforeAll(() => {
  GET = require('@/app/api/admin/users/[userId]/student-reviews/route').GET;
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.studentReview.findMany.mockResolvedValue([]);
});

it('rejects non-admins via requireAdminUser', async () => {
  requireAdminUser.mockResolvedValue(
    NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }),
  );

  const res = await GET(new Request('http://x/api/admin/users/u1/student-reviews'), {
    params: Promise.resolve({ userId: 'u1' }),
  });

  expect(res.status).toBe(403);
  expect(prisma.studentReview.findMany).not.toHaveBeenCalled();
});

it('returns reviews (with comments) + distinct courses for an admin', async () => {
  requireAdminUser.mockResolvedValue(ADMIN);
  prisma.studentReview.findMany
    .mockResolvedValueOnce([
      {
        id: 'sr1',
        rating: 5,
        comment: 'Muy puntual',
        tutor: { id: 't1', name: 'Tutor' },
        session: { id: 's1', startTimestamp: new Date(), course: { id: 'c1', name: 'Cálculo I', code: 'MAT101' } },
      },
    ])
    .mockResolvedValueOnce([
      { session: { course: { id: 'c1', name: 'Cálculo I', code: 'MAT101' } } },
      { session: { course: { id: 'c1', name: 'Cálculo I', code: 'MAT101' } } }, // duplicate → deduped
    ]);

  const res = await GET(new Request('http://x/api/admin/users/u1/student-reviews'), {
    params: Promise.resolve({ userId: 'u1' }),
  });
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.reviews).toHaveLength(1);
  // Admin IS allowed to read the comment text (only surface that exposes it).
  expect(body.reviews[0].comment).toBe('Muy puntual');
  // Distinct materias, deduped, reached via the session relation.
  expect(body.courses).toEqual([{ id: 'c1', name: 'Cálculo I', code: 'MAT101' }]);
});

it('filters by materia through the session relation (normalized, no course column)', async () => {
  requireAdminUser.mockResolvedValue(ADMIN);

  const res = await GET(new Request('http://x/api/admin/users/u1/student-reviews?courseId=c1'), {
    params: Promise.resolve({ userId: 'u1' }),
  });

  expect(res.status).toBe(200);
  // Identify the reviews query (it uses `include`; the courses query uses `select`).
  const reviewsCall = prisma.studentReview.findMany.mock.calls.find(([arg]) => arg.include);
  expect(reviewsCall[0].where).toMatchObject({
    studentId: 'u1',
    status: 'done',
    session: { courseId: 'c1' },
  });
  // There must be NO denormalized courseId column on student_reviews.
  expect(reviewsCall[0].where).not.toHaveProperty('courseId');
});
