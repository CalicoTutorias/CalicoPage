/**
 * @jest-environment node
 *
 * Integration tests for user reviews API routes.
 * Mocks Prisma at the lowest level and exercises the full
 * route handler → service → repository chain.
 */

// Mock Prisma singleton
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    review: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

const prisma = require('@/lib/prisma').default;

// ─── GET /api/users/:id/reviews ─────────────────────────────────────

describe('GET /api/users/:id/reviews', () => {
  let GET;

  beforeAll(() => {
    const route = require('@/app/api/users/[id]/reviews/route');
    GET = route.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(url) {
    return new Request(url);
  }

  it('returns reviews for a valid user id', async () => {
    const mockReviews = [
      {
        id: 'r1',
        rating: 5,
        status: 'completed',
        comment: 'Excelente',
        student: { id: 1, name: 'Ana', profilePictureUrl: null },
        session: { id: 's1', courseId: 'c1', course: { name: 'Cálculo I' } },
      },
    ];

    prisma.review.findMany.mockResolvedValue(mockReviews);

    const request = buildRequest('http://localhost/api/users/10/reviews?limit=5');
    const response = await GET(request, {
      params: Promise.resolve({ id: '10' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reviews).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.reviews[0].comment).toBe('Excelente');
  });

  it('returns empty array when user has no reviews', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const request = buildRequest('http://localhost/api/users/99/reviews');
    const response = await GET(request, {
      params: Promise.resolve({ id: '99' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.reviews).toEqual([]);
    expect(body.count).toBe(0);
  });

  it('respects limit query param (capped at 100)', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const request = buildRequest('http://localhost/api/users/10/reviews?limit=200');
    await GET(request, {
      params: Promise.resolve({ id: '10' }),
    });

    // The limit should be capped at 100
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('uses default limit of 50 when not specified', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const request = buildRequest('http://localhost/api/users/10/reviews');
    await GET(request, {
      params: Promise.resolve({ id: '10' }),
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
  });

  it('queries reviews by tutorId (the user whose reviews are requested)', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const request = buildRequest('http://localhost/api/users/42/reviews');
    await GET(request, {
      params: Promise.resolve({ id: '42' }),
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tutorId: '42', status: 'done' },
      }),
    );
  });
});

// ─── GET /api/users/:id/reviews/stats ───────────────────────────────

describe('GET /api/users/:id/reviews/stats', () => {
  let GET;

  beforeAll(() => {
    const route = require('@/app/api/users/[id]/reviews/stats/route');
    GET = route.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildRequest(url) {
    return new Request(url);
  }

  it('returns average and count for a tutor with reviews', async () => {
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.333333 },
      _count: { id: 3 },
    });

    const request = buildRequest('http://localhost/api/users/10/reviews/stats');
    const response = await GET(request, {
      params: Promise.resolve({ id: '10' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.average).toBe(4.33); // Rounded to 2 decimals
    expect(body.count).toBe(3);
  });

  it('returns zero average when tutor has no reviews', async () => {
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { id: 0 },
    });

    const request = buildRequest('http://localhost/api/users/99/reviews/stats');
    const response = await GET(request, {
      params: Promise.resolve({ id: '99' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.average).toBe(0);
    expect(body.count).toBe(0);
  });

  it('filters only completed reviews with non-null ratings', async () => {
    prisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 5 },
      _count: { id: 1 },
    });

    const request = buildRequest('http://localhost/api/users/10/reviews/stats');
    await GET(request, {
      params: Promise.resolve({ id: '10' }),
    });

    expect(prisma.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'done',
          rating: { not: null },
        }),
      }),
    );
  });
});
