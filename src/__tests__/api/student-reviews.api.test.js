/**
 * @jest-environment node
 *
 * Integration tests — tutor→student reciprocal reviews at the HTTP boundary.
 * Exercises route handler → service → repository with Prisma mocked at the
 * singleton level (same pattern as user-reviews.api.test.js).
 *
 * Routes covered:
 *   POST /api/sessions/:id/student-reviews — create/edit (tutor only)
 *   GET  /api/sessions/:id/student-reviews — caller's own reviews only
 *   GET  /api/users/me/student-rating      — own aggregate (number only)
 *   GET  /api/sessions & /api/sessions/:id — PRIVACY: rating attached only
 *                                            to tutor payloads
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    session: { findMany: jest.fn(), findUnique: jest.fn() },
    studentReview: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/auth/guards', () => ({
  requireTutor: jest.fn(),
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
  tryAuthenticateRequest: jest.fn(),
}));

const { NextResponse } = require('next/server');
const prisma = require('@/lib/prisma').default;
const { requireTutor } = require('@/lib/auth/guards');
const { authenticateRequest } = require('@/lib/auth/middleware');

const TUTOR_AUTH = { sub: 'tutor-1', email: 'tutor@test.co', isTutorApproved: true };
const STUDENT_AUTH = { sub: 'student-1', email: 'stu@test.co', isTutorApproved: false };

function makeDbSession(overrides = {}) {
  const past = new Date(Date.now() - 3600_000);
  return {
    id: 'session-1',
    tutorId: 'tutor-1',
    courseId: 'course-1',
    status: 'Completed',
    startTimestamp: new Date(past.getTime() - 3600_000),
    endTimestamp: past,
    participants: [
      { sessionId: 'session-1', studentId: 'student-1', student: { id: 'student-1', name: 'Ana', email: 'stu@test.co', profilePictureUrl: null } },
    ],
    payments: [],
    reviews: [],
    course: { id: 'course-1', name: 'Cálculo I' },
    tutor: { id: 'tutor-1', name: 'Tutor', email: 'tutor@test.co', profilePictureUrl: null },
    ...overrides,
  };
}

function buildPost(url, body) {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // $transaction: run the callback against the same prisma mock as tx
  prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  prisma.studentReview.findMany.mockResolvedValue([]);
  prisma.user.update.mockResolvedValue({ id: 'student-1', studentRating: 4, studentRatingCount: 1 });
});

// ─── POST /api/sessions/:id/student-reviews ─────────────────────────

describe('POST /api/sessions/:id/student-reviews', () => {
  let POST;
  beforeAll(() => {
    POST = require('@/app/api/sessions/[id]/student-reviews/route').POST;
  });

  it('rejects non-tutors via the requireTutor guard', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    );

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );

    expect(res.status).toBe(403);
    expect(prisma.studentReview.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 on out-of-range rating (zod)', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 6 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );

    expect(res.status).toBe(400);
    expect(prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it('creates the review (201), upserting as done and recomputing the aggregate', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession());
    prisma.studentReview.upsert.mockResolvedValue({
      id: 'sr-1', sessionId: 'session-1', tutorId: 'tutor-1', studentId: 'student-1',
      rating: 5, status: 'done', comment: null,
    });

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.review.status).toBe('done');

    const upsertArgs = prisma.studentReview.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({
      sessionId_tutorId_studentId: { sessionId: 'session-1', tutorId: 'tutor-1', studentId: 'student-1' },
    });
    expect(upsertArgs.create).toMatchObject({ rating: 5, status: 'done' });
    // Aggregate recomputed on the user row
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'student-1' } }),
    );
  });

  it('returns 200 + updated=true when editing an existing done review', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession());
    prisma.studentReview.findMany.mockResolvedValue([
      { id: 'sr-1', sessionId: 'session-1', tutorId: 'tutor-1', studentId: 'student-1', status: 'done', rating: 3 },
    ]);
    prisma.studentReview.upsert.mockResolvedValue({
      id: 'sr-1', sessionId: 'session-1', tutorId: 'tutor-1', studentId: 'student-1',
      rating: 5, status: 'done', comment: null,
    });

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(true);
  });

  it('returns 403 NOT_SESSION_TUTOR when the caller is a tutor of another session', async () => {
    requireTutor.mockReturnValue({ ...TUTOR_AUTH, sub: 'otro-tutor' });
    prisma.session.findUnique.mockResolvedValue(makeDbSession());

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe('NOT_SESSION_TUTOR');
    expect(prisma.studentReview.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_STUDENT when the reviewee is not a participant', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession());

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'intruso', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_STUDENT');
  });

  it('returns 422 when the session has not ended yet', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(
      makeDbSession({ endTimestamp: new Date(Date.now() + 3600_000) }),
    );

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe('SESSION_NOT_ENDED');
  });

  it('returns 422 for canceled sessions', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession({ status: 'Canceled' }));

    const res = await POST(
      buildPost('http://x/api/sessions/session-1/student-reviews', { studentId: 'student-1', rating: 5 }),
      { params: Promise.resolve({ id: 'session-1' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe('SESSION_NOT_ELIGIBLE');
  });
});

// ─── GET /api/sessions/:id/student-reviews ──────────────────────────

describe('GET /api/sessions/:id/student-reviews', () => {
  let GET;
  beforeAll(() => {
    GET = require('@/app/api/sessions/[id]/student-reviews/route').GET;
  });

  it('only ever returns reviews written by the calling tutor', async () => {
    requireTutor.mockReturnValue(TUTOR_AUTH);
    prisma.studentReview.findMany.mockResolvedValue([
      { id: 'sr-1', tutorId: 'tutor-1', studentId: 'student-1', status: 'pending', rating: null },
    ]);

    const res = await GET(new Request('http://x/api/sessions/session-1/student-reviews'), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    // The where clause is pinned to the caller's id — not just the session
    expect(prisma.studentReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: 'session-1', tutorId: 'tutor-1' } }),
    );
  });

  it('rejects students (guard)', async () => {
    requireTutor.mockReturnValue(
      NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    );

    const res = await GET(new Request('http://x/api/sessions/session-1/student-reviews'), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(res.status).toBe(403);
    expect(prisma.studentReview.findMany).not.toHaveBeenCalled();
  });
});

// ─── GET /api/users/me/student-rating ───────────────────────────────

describe('GET /api/users/me/student-rating', () => {
  let GET;
  beforeAll(() => {
    GET = require('@/app/api/users/me/student-rating/route').GET;
  });

  it('returns the caller own aggregate — number only, no reviews/comments', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    prisma.user.findUnique.mockResolvedValue({ studentRating: '4.50', studentRatingCount: 8 });

    const res = await GET(new Request('http://x/api/users/me/student-rating'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, average: 4.5, count: 8 });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'student-1' } }),
    );
  });

  it('requires authentication', async () => {
    authenticateRequest.mockReturnValue(
      NextResponse.json({ success: false, error: 'No token' }, { status: 401 }),
    );

    const res = await GET(new Request('http://x/api/users/me/student-rating'));

    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ─── PRIVACY: session payload gating ────────────────────────────────

describe('PRIVACY — student rating only reaches tutor payloads', () => {
  let GET_SESSIONS;
  let GET_SESSION;
  beforeAll(() => {
    GET_SESSIONS = require('@/app/api/sessions/route').GET;
    GET_SESSION = require('@/app/api/sessions/[id]/route').GET;
  });

  it('GET /api/sessions?role=tutor attaches studentRating + studentReviews', async () => {
    authenticateRequest.mockReturnValue(TUTOR_AUTH);
    prisma.session.findMany.mockResolvedValue([makeDbSession()]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'student-1', studentRating: '4.75', studentRatingCount: 12 },
    ]);
    prisma.studentReview.findMany.mockResolvedValue([
      { id: 'sr-1', sessionId: 'session-1', tutorId: 'tutor-1', studentId: 'student-1', status: 'pending', rating: null },
    ]);

    const res = await GET_SESSIONS(new Request('http://x/api/sessions?role=tutor'));
    const body = await res.json();

    expect(body.success).toBe(true);
    const participant = body.sessions[0].participants[0];
    expect(participant.student.studentRating).toBe(4.75);
    expect(participant.student.studentRatingCount).toBe(12);
    expect(body.sessions[0].studentReviews).toHaveLength(1);
  });

  it('GET /api/sessions (student) never queries nor attaches ratings', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    prisma.session.findMany.mockResolvedValue([makeDbSession()]);

    const res = await GET_SESSIONS(new Request('http://x/api/sessions'));
    const body = await res.json();

    expect(body.success).toBe(true);
    const participant = body.sessions[0].participants[0];
    expect(participant.student.studentRating).toBeUndefined();
    expect(body.sessions[0].studentReviews).toBeUndefined();
    // The ratings batch query must not run for student payloads
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.studentReview.findMany).not.toHaveBeenCalled();
  });

  it('GET /api/sessions/:id enriches only when the caller is the session tutor', async () => {
    authenticateRequest.mockReturnValue(TUTOR_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession());
    prisma.user.findMany.mockResolvedValue([
      { id: 'student-1', studentRating: '4.75', studentRatingCount: 12 },
    ]);

    const res = await GET_SESSION(new Request('http://x/api/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await res.json();

    expect(body.session.participants[0].student.studentRating).toBe(4.75);
    expect(body.session.studentReviews).toBeDefined();
  });

  it('GET /api/sessions/:id gives students a payload without ratings', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    prisma.session.findUnique.mockResolvedValue(makeDbSession());

    const res = await GET_SESSION(new Request('http://x/api/sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    const body = await res.json();

    expect(body.session.participants[0].student.studentRating).toBeUndefined();
    expect(body.session.studentReviews).toBeUndefined();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('sanitizeUser (used by login/request-tutor) strips private rating fields', () => {
    const { sanitizeUser } = require('@/lib/repositories/user.repository');
    const clean = sanitizeUser({
      id: 'u1',
      name: 'Ana',
      email: 'ana@test.co',
      passwordHash: 'hash',
      studentRating: '3.20',
      studentRatingCount: 5,
    });

    expect(clean).toEqual({ id: 'u1', name: 'Ana', email: 'ana@test.co' });
  });

  it('GET /api/users/:id strips the private rating fields (sanitize)', async () => {
    authenticateRequest.mockReturnValue(STUDENT_AUTH);
    // Simulate the DB row carrying the private fields
    prisma.user.findUnique.mockResolvedValue({
      id: 'student-9',
      name: 'Otro Estudiante',
      email: 'otro@test.co',
      studentRating: '2.10',
      studentRatingCount: 4,
      passwordHash: 'x',
      tutorProfile: null,
      career: null,
      tutorApplications: [],
    });

    const GET_USER = require('@/app/api/users/[id]/route').GET;
    const res = await GET_USER(new Request('http://x/api/users/student-9'), {
      params: Promise.resolve({ id: 'student-9' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.user.studentRating).toBeUndefined();
    expect(body.user.studentRatingCount).toBeUndefined();
    expect(body.user.passwordHash).toBeUndefined();
  });
});
