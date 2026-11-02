/**
 * @jest-environment node
 *
 * GET /api/sessions/:id/reviews — only the session tutor, its participant
 * students, or an admin (DB role) may read.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() } },
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

jest.mock('@/lib/services/session.service', () => ({
  getSessionById: jest.fn(),
}));

jest.mock('@/lib/services/review.service', () => ({
  getSessionReviews: jest.fn(),
  createReview: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');
const sessionService = require('@/lib/services/session.service');
const reviewService = require('@/lib/services/review.service');
const route = require('@/app/api/sessions/[id]/reviews/route');

const ctx = { params: Promise.resolve({ id: 's1' }) };
const req = () => new Request('http://localhost/api/sessions/s1/reviews');

beforeEach(() => {
  jest.clearAllMocks();
  sessionService.getSessionById.mockResolvedValue({
    id: 's1',
    tutorId: 'tutor1',
    participants: [{ studentId: 'student1' }],
  });
  reviewService.getSessionReviews.mockResolvedValue([{ id: 'r1' }]);
});

describe('GET /api/sessions/:id/reviews', () => {
  it('returns 403 for an unrelated user', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'other' });
    prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT', isActive: true });

    const res = await route.GET(req(), ctx);

    expect(res.status).toBe(403);
    expect(reviewService.getSessionReviews).not.toHaveBeenCalled();
  });

  it('does not trust a JWT admin role (DB role wins)', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'other', role: 'ADMIN' });
    prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT', isActive: true });

    const res = await route.GET(req(), ctx);

    expect(res.status).toBe(403);
  });

  it('allows the session tutor', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'tutor1' });
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('allows a participant student', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'student1' });
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('allows an admin by DB role', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'admin1' });
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', isActive: true });
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(200);
  });

  it('returns 404 when the session does not exist', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'student1' });
    const err = new Error('Session not found');
    err.code = 'NOT_FOUND';
    sessionService.getSessionById.mockRejectedValue(err);
    const res = await route.GET(req(), ctx);
    expect(res.status).toBe(404);
  });
});
