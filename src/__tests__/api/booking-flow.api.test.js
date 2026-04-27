/**
 * @jest-environment node
 *
 * Integration tests — Student Booking flow at the HTTP boundary.
 *
 * Exercises route handler → service → repository → Prisma. Prisma is mocked
 * at the singleton level (the same pattern used in user-reviews.api.test.js).
 *
 * Routes covered:
 *   GET /api/users/tutors        — tutor search (subject filter, self-exclusion)
 *   POST /api/sessions           — direct creation must be blocked (PAYMENT_REQUIRED)
 *   GET /api/sessions            — student session history
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    session: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    review: { findMany: jest.fn(), aggregate: jest.fn() },
  },
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
  tryAuthenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest, tryAuthenticateRequest } = require('@/lib/auth/middleware');

const { makeTutor, makeSession } = require('../fixtures/booking.fixtures');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── helpers ────────────────────────────────────────────────────────

function buildGet(url, headers = {}) {
  return new Request(url, { headers });
}

function buildPost(url, body = {}, headers = {}) {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const STUDENT_AUTH = {
  sub: 42,
  email: 'laura@test.co',
  isTutorRequested: false,
  isTutorApproved: false,
};

// ─── GET /api/users/tutors ──────────────────────────────────────────

describe('GET /api/users/tutors — search', () => {
  let GET;
  beforeAll(() => {
    GET = require('@/app/api/users/tutors/route').GET;
  });

  it('test_should_filter_tutors_by_courseId_when_query_param_provided', async () => {
    const tutors = [makeTutor({ id: 1 }), makeTutor({ id: 2 })];
    prisma.user.findMany.mockResolvedValue(tutors);
    tryAuthenticateRequest.mockReturnValue(null);

    const res = await GET(buildGet('http://x/api/users/tutors?courseId=course-uuid-cal-1&limit=20'));
    const body = await res.json();

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where.isTutorApproved).toBe(true);
    expect(args.where.tutorProfile.tutorCourses.some.courseId).toBe('course-uuid-cal-1');
    expect(args.take).toBe(20);
    expect(body.success).toBe(true);
    expect(body.tutors).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('test_should_default_to_listing_all_approved_tutors_when_no_courseId', async () => {
    prisma.user.findMany.mockResolvedValue([makeTutor()]);
    tryAuthenticateRequest.mockReturnValue(null);

    await GET(buildGet('http://x/api/users/tutors'));

    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isTutorApproved: true });
    expect(args.take).toBe(100);
  });

  it('test_should_exclude_the_authenticated_user_from_the_returned_tutor_list', async () => {
    const tutors = [makeTutor({ id: 1 }), makeTutor({ id: 42 }), makeTutor({ id: 3 })];
    prisma.user.findMany.mockResolvedValue(tutors);
    tryAuthenticateRequest.mockReturnValue({ sub: 42 });

    const res = await GET(buildGet('http://x/api/users/tutors'));
    const body = await res.json();

    const ids = body.tutors.map((t) => t.id);
    expect(ids).toEqual([1, 3]);
    expect(body.count).toBe(2);
  });

  it('test_should_include_all_tutors_when_request_is_unauthenticated', async () => {
    const tutors = [makeTutor({ id: 1 }), makeTutor({ id: 2 })];
    prisma.user.findMany.mockResolvedValue(tutors);
    tryAuthenticateRequest.mockReturnValue(null);

    const res = await GET(buildGet('http://x/api/users/tutors'));
    const body = await res.json();

    expect(body.count).toBe(2);
  });
});

// ─── POST /api/sessions — direct creation is blocked ───────────────

describe('POST /api/sessions — payment-required guard', () => {
  let POST;
  beforeAll(() => {
    POST = require('@/app/api/sessions/route').POST;
  });

  it('test_should_return_403_PAYMENT_REQUIRED_for_direct_session_creation', async () => {
    const res = await POST(buildPost('http://x/api/sessions', { tutorId: 99 }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PAYMENT_REQUIRED');
  });
});

// ─── GET /api/sessions — student history ───────────────────────────

describe('GET /api/sessions — student history', () => {
  let GET;
  beforeAll(() => {
    GET = require('@/app/api/sessions/route').GET;
  });

  it('test_should_return_401_when_no_bearer_token_is_present', async () => {
    const { NextResponse } = require('next/server');
    authenticateRequest.mockReturnValue(
      NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 }),
    );

    const res = await GET(buildGet('http://x/api/sessions'));
    expect(res.status).toBe(401);
  });

  it('test_should_return_authenticated_students_session_list', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);

    const sessions = [
      makeSession({ id: 's1' }),
      makeSession({ id: 's2', startTimestamp: new Date('2026-05-01T12:00:00.000Z') }),
    ];
    prisma.session.findMany.mockResolvedValue(sessions);

    const res = await GET(buildGet('http://x/api/sessions'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.count).toBe(2);
    // Repository scoped via participants.some.studentId
    const args = prisma.session.findMany.mock.calls[0][0];
    expect(args.where.participants.some.studentId).toBe(42);
    expect(args.take).toBe(50);
  });

  it('test_should_clamp_limit_to_100', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    prisma.session.findMany.mockResolvedValue([]);

    await GET(buildGet('http://x/api/sessions?limit=500'));

    expect(prisma.session.findMany.mock.calls[0][0].take).toBe(100);
  });

  it('test_should_reject_invalid_status_query_with_400', async () => {
    authenticateRequest.mockReturnValue({ ...STUDENT_AUTH, isTutorApproved: true });

    const res = await GET(buildGet('http://x/api/sessions?role=tutor&status=Bogus'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid status "Bogus"/);
  });
});
