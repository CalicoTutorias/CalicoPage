/**
 * Unit tests for student-review.service (tutor→student reciprocal reviews).
 * Mocks the repositories to verify business rules in isolation.
 */

jest.mock('@/lib/repositories/student-review.repository', () => ({
  upsertStudentReview: jest.fn(),
  updateStudentRatingStats: jest.fn(),
  findBySessionForTutor: jest.fn(),
  findReceivedByStudent: jest.fn(),
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
  studentReviewRepo.findBySessionForTutor.mockResolvedValue([]);
  studentReviewRepo.upsertStudentReview.mockImplementation(async (data) => ({ id: 'sr-1', ...data }));
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
    expect(studentReviewRepo.upsertStudentReview).not.toHaveBeenCalled();
  });

  it('rejects when the reviewee did not participate (INVALID_STUDENT)', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    await expect(
      service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: 'intruso', rating: 4 }),
    ).rejects.toMatchObject({ code: 'INVALID_STUDENT' });
    expect(studentReviewRepo.upsertStudentReview).not.toHaveBeenCalled();
  });
});

describe('createStudentReview — happy path', () => {
  it('upserts as done and recomputes the student aggregate', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    const result = await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 4,
      comment: 'Muy puntual',
    });

    expect(studentReviewRepo.upsertStudentReview).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      tutorId: TUTOR_ID,
      studentId: STUDENT_ID,
      rating: 4,
      status: 'done',
      comment: 'Muy puntual',
    });
    expect(studentReviewRepo.updateStudentRatingStats).toHaveBeenCalledWith(STUDENT_ID);
    expect(result.updated).toBe(false);
    expect(result.review).toMatchObject({ rating: 4, status: 'done' });
  });

  it('normalizes empty comment to null', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());

    await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 5,
      comment: '',
    });

    expect(studentReviewRepo.upsertStudentReview).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });

  it('flags updated=true when editing an already-done review', async () => {
    sessionRepo.findById.mockResolvedValue(makeSession());
    studentReviewRepo.findBySessionForTutor.mockResolvedValue([
      { sessionId: SESSION_ID, tutorId: TUTOR_ID, studentId: STUDENT_ID, status: 'done', rating: 3 },
    ]);

    const result = await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 5,
    });

    expect(result.updated).toBe(true);
    expect(studentReviewRepo.updateStudentRatingStats).toHaveBeenCalledWith(STUDENT_ID);
  });

  it('allows rating a session that ended but was never marked Completed', async () => {
    // Mirrors the student→tutor flow: eligibility is "ended + not canceled",
    // not strictly status === Completed.
    sessionRepo.findById.mockResolvedValue(makeSession({ status: 'Accepted' }));

    const result = await service.createStudentReview(SESSION_ID, TUTOR_ID, {
      studentId: STUDENT_ID,
      rating: 4,
    });

    expect(result.review.status).toBe('done');
  });

  it('rates each participant independently in group sessions', async () => {
    sessionRepo.findById.mockResolvedValue(
      makeSession({ participants: [{ studentId: 'a' }, { studentId: 'b' }] }),
    );

    await service.createStudentReview(SESSION_ID, TUTOR_ID, { studentId: 'b', rating: 2 });

    expect(studentReviewRepo.upsertStudentReview).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'b', rating: 2 }),
    );
    expect(studentReviewRepo.updateStudentRatingStats).toHaveBeenCalledWith('b');
  });
});

describe('read helpers', () => {
  it('getSessionStudentReviewsForTutor delegates filtered by tutor', async () => {
    studentReviewRepo.findBySessionForTutor.mockResolvedValue([{ id: 'sr-1' }]);

    const result = await service.getSessionStudentReviewsForTutor(SESSION_ID, TUTOR_ID);

    expect(studentReviewRepo.findBySessionForTutor).toHaveBeenCalledWith(SESSION_ID, TUTOR_ID);
    expect(result).toEqual([{ id: 'sr-1' }]);
  });

  it('getOwnStudentRating returns the aggregate number only', async () => {
    studentReviewRepo.getStudentRating.mockResolvedValue({ average: 4.5, count: 8 });

    const result = await service.getOwnStudentRating(STUDENT_ID);

    expect(result).toEqual({ average: 4.5, count: 8 });
  });
});
