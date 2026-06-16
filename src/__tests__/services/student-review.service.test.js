/**
 * Unit tests for student-review.service (tutor→student reciprocal reviews).
 * Mocks the repositories to verify business rules in isolation.
 *
 * New contract under test:
 *  - WRITE-ONCE publish (no editing); ALREADY_REVIEWED bubbles up.
 *  - The service returns ONLY a status flag — never the stored comment/rating.
 *  - Tutor reads are content-free ({ studentId, status } only).
 */

jest.mock('@/lib/repositories/student-review.repository', () => ({
  publishStudentReview: jest.fn(),
  updateStudentRatingStats: jest.fn(),
  findStatusBySessionForTutor: jest.fn(),
  findReceivedByStudent: jest.fn(),
  findReviewedCoursesByStudent: jest.fn(),
  getStudentRating: jest.fn(),
}));

jest.mock('@/lib/repositories/session.repository', () => ({
  findById: jest.fn(),
}));

const studentReviewRepo = require('@/lib/repositories/student-review.repository');
const sessionRepo = require('@/lib/repositories/session.repository');
const service = require('@/lib/services/student-review.service');

const TUTOR_ID = 'tutor-1';
const STUDENT_ID = 'student-1';
const SESSION_ID = 'session-1';

function makeSession(overrides = {}) {
  const past = new Date(Date.now() - 60 * 60 * 1000); // ended 1h ago
  return {
    id: SESSION_ID,
    tutorId: TUTOR_ID,
    status: 'Completed',
    endTimestamp: past.toISOString(),
    participants: [{ studentId: STUDENT_ID }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  studentReviewRepo.publishStudentReview.mockResolvedValue({ status: 'done' });
  studentReviewRepo.updateStudentRatingStats.mockResolvedValue({});
});

describe('createStudentReview — validations', () => {
  it.each([0, 6, 3.5, '5', null, undefined])(
    'rejects invalid rating %p with INVALID_RATING',
    async (rating) => {
      await expect(
        service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: STUDENT_ID, rating }),
      ).rejects.toMatchObject({ code: 'INVALID_RATING' });
      expect(sessionRepo.findById).not.toHaveBeenCalled();
    },
  );

  it('rejects when session does not exist (NOT_FOUND)', async () => {
    sessionRepo.findById.mockResolvedValue(null);

    await expect(
      service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: STUDENT_ID, rating: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects when session has not ended yet (SESSION_NOT_ENDED)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    sessionRepo.findById.mockResolvedValue(makeSession({ endTimestamp: future.toISOString() }));

    await expect(
      service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: STUDENT_ID, rating: 5 }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_ENDED' });
  });

  it.each(['Canceled', 'Rejected'])(
    'rejects %s sessions (SESSION_NOT_ELIGIBLE)',
    async (status) => {
      sessionRepo.findById.mockResolvedValue(makeSession({ status }));

      await expect(
        service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: STUDENT_ID, rating: 4 }),
      ).rejects.toMatchObject({ code: 'SESSION_NOT_ELIGIBLE' });
    },
  );

  it('rejects when caller is not the session tutor (NOT_SESSION_TUTOR)', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    await expect(
      service.createStudentReview(SESSION_ID, 'another-tutor', { studentId: STUDENT_ID, rating: 4 }),
    ).rejects.toMatchObject({ code: 'NOT_SESSION_TUTOR' });
    expect(studentReviewRepo.publishStudentReview).not.toHaveBeenCalled();
  });

  it('rejects when the reviewee did not participate (INVALID_STUDENT)', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    await expect(
      service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: 'intruso', rating: 4 }),
    ).rejects.toMatchObject({ code: 'INVALID_STUDENT' });
    expect(studentReviewRepo.publishStudentReview).not.toHaveBeenCalled();
  });
});

describe('createStudentReview — happy path (write-once)', () => {
  it('publishes write-once and recomputes the student aggregate', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    const result = await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 4,
      comment: 'Muy puntual',
    });

    expect(studentReviewRepo.publishStudentReview).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      rating: 4,
      comment: 'Muy puntual',
    });
    expect(studentReviewRepo.updateStudentRatingStats).toHaveBeenCalledWith(STUDENT_ID);
    // The service returns ONLY a status flag — never the comment/rating back.
    expect(result).toEqual({ status: 'done' });
    expect(result).not.toHaveProperty('review');
    expect(result).not.toHaveProperty('comment');
  });

  it('normalizes empty comment to null', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 5,
      comment: '',
    });

    expect(studentReviewRepo.publishStudentReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });

  it('propagates ALREADY_REVIEWED from the write-once publish (no re-rating)', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());
    const err = new Error('already');
    err.code = 'ALREADY_REVIEWED';
    studentReviewRepo.publishStudentReview.mockRejectedValue(err);

    await expect(
      service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: STUDENT_ID, rating: 5 }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    // Aggregate must NOT be recomputed when nothing was published.
    expect(studentReviewRepo.updateStudentRatingStats).not.toHaveBeenCalled();
  });

  it('allows rating a session that ended but was never marked Completed', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession({ status: 'Accepted' }));

    const result = await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 4,
    });

    expect(result).toEqual({ status: 'done' });
  });

  it('rates each participant independently in group sessions', async () => {
    sessionRepo.findById.mockResolvedValue(
      makeSession({ participants: [{ studentId: 'a' }, { studentId: 'b' }] }),
    );

    await service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: 'b', rating: 2 });

    expect(studentReviewRepo.publishStudentReview).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'b', rating: 2 }),
    );
    expect(studentReviewRepo.updateStudentRatingStats).toHaveBeenCalledWith('b');
  });
});

describe('read helpers', () => {
  it('getPendingStudentTargetsForTutor returns content-free status only', async () => {
    studentReviewRepo.findStatusBySessionForTutor.mockResolvedValue([
      { studentId: STUDENT_ID, status: 'pending' },
    ]);

    const result = await service.getPendingStudentTargetsForTutor(SESSION_ID, TUTOR_ID);

    expect(studentReviewRepo.findStatusBySessionForTutor).toHaveBeenCalledWith(SESSION_ID, TUTOR_ID);
    expect(result).toEqual([{ studentId: STUDENT_ID, status: 'pending' }]);
    // Content-free: no rating, no comment fields ever.
    for (const row of result) {
      expect(row).not.toHaveProperty('rating');
      expect(row).not.toHaveProperty('comment');
    }
  });

  it('does not expose a tutor-facing read path for comment content', () => {
    // The legacy comment-leaking helper must be gone from the service surface.
    expect(service.getSessionStudentReviewsForTutor).toBeUndefined();
  });

  it('getOwnStudentRating returns the aggregate number only', async () => {
    studentReviewRepo.getStudentRating.mockResolvedValue({ average: 4.5, count: 8 });

    const result = await service.getOwnStudentRating(STUDENT_ID);

    expect(result).toEqual({ average: 4.5, count: 8 });
  });

  it('getStudentReviewsReceived (admin) passes the materia filter through', async () => {
    studentReviewRepo.findReceivedByStudent.mockResolvedValue([{ id: 'sr1', comment: 'x' }]);

    const result = await service.getStudentReviewsReceived(STUDENT_ID, { courseId: 'c1', limit: 10 });

    expect(studentReviewRepo.findReceivedByStudent).toHaveBeenCalledWith(STUDENT_ID, { courseId: 'c1', limit: 10 });
    expect(result).toEqual([{ id: 'sr1', comment: 'x' }]);
  });

  it('getReviewedCoursesAsStudent delegates to the relation-based repo method', async () => {
    studentReviewRepo.findReviewedCoursesByStudent.mockResolvedValue([{ id: 'c1', name: 'Cálculo' }]);

    const result = await service.getReviewedCoursesAsStudent(STUDENT_ID);

    expect(studentReviewRepo.findReviewedCoursesByStudent).toHaveBeenCalledWith(STUDENT_ID);
    expect(result).toEqual([{ id: 'c1', name: 'Cálculo' }]);
  });
});
