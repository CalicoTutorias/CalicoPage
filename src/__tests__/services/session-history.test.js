/**
 * Unit tests — Session History
 *
 * sessionService.getSessionsByStudent  → straight repo passthrough.
 * sessionService.getStudentHistory     → enriches with pendingReview AND
 *                                         auto-creates a 'pending' review
 *                                         placeholder for any past session
 *                                         that does not yet have one.
 *
 * splitPastUpcoming (pure helper)      → past vs upcoming partitioning.
 */

jest.mock('@/lib/repositories/session.repository', () => ({
  findByStudent: jest.fn(),
  findByTutor: jest.fn(),
  findByTutorAndStatus: jest.fn(),
  getStudentStats: jest.fn(),
}));
jest.mock('@/lib/repositories/availability.repository', () => ({
  findScheduleByUserId: jest.fn(),
  findAvailabilityByDay: jest.fn(),
}));
jest.mock('@/lib/repositories/user.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/repositories/review.repository', () => ({
  upsertReview: jest.fn(() => Promise.resolve({ id: 'rev_new', status: 'pending' })),
  createPendingReview: jest.fn(),
  getAverageScore: jest.fn(),
}));
jest.mock('@/lib/services/notification.service', () => ({
  notifySessionAccepted: jest.fn(),
  notifySessionConfirmedToTutor: jest.fn(),
  notifySessionRejected: jest.fn(),
  notifySessionCancelled: jest.fn(),
  notifySessionCompleted: jest.fn(),
  notifyStudentJoinedGroup: jest.fn(),
}));
jest.mock('@/lib/services/email.service', () => ({ sendSessionConfirmedEmail: jest.fn() }));
jest.mock('@/lib/services/calico-calendar.service', () => ({
  createTutoringSessionEvent: jest.fn(),
  cancelTutoringSessionEvent: jest.fn(),
}));
jest.mock('@/lib/services/session-attachment.service', () => ({ registerAttachments: jest.fn() }));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { session: { update: jest.fn() } },
}));

const sessionRepo = require('@/lib/repositories/session.repository');
const reviewRepo = require('@/lib/repositories/review.repository');
const sessionService = require('@/lib/services/session.service');

const { makeSession, splitPastUpcoming } = require('../fixtures/booking.fixtures');

const STUDENT_ID = 42;
const TUTOR_ID = 99;

// Fixed "now" — tests anchor sessions relative to this.
const NOW = new Date('2026-04-26T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  // Silence the verbose console.log instrumentation in getStudentHistory.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── getSessionsByStudent (thin passthrough) ────────────────────────

describe('sessionService.getSessionsByStudent', () => {
  it('test_should_call_repository_with_studentId_and_default_limit', async () => {
    sessionRepo.findByStudent.mockResolvedValue([]);

    await sessionService.getSessionsByStudent(STUDENT_ID);

    expect(sessionRepo.findByStudent).toHaveBeenCalledWith(STUDENT_ID, 50);
  });

  it('test_should_propagate_custom_limit_to_repository', async () => {
    sessionRepo.findByStudent.mockResolvedValue([]);

    await sessionService.getSessionsByStudent(STUDENT_ID, 5);

    expect(sessionRepo.findByStudent).toHaveBeenCalledWith(STUDENT_ID, 5);
  });

  it('test_should_return_repository_result_unchanged', async () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
    sessionRepo.findByStudent.mockResolvedValue(sessions);

    const result = await sessionService.getSessionsByStudent(STUDENT_ID);

    expect(result).toBe(sessions);
  });
});

// ─── getStudentHistory (enrichment + pending-review backfill) ───────

describe('sessionService.getStudentHistory', () => {
  function past(id, overrides = {}) {
    return makeSession({
      id,
      startTimestamp: new Date('2026-04-01T15:00:00.000Z'),
      endTimestamp: new Date('2026-04-01T16:00:00.000Z'),
      status: 'Completed',
      ...overrides,
    });
  }

  function upcoming(id, overrides = {}) {
    return makeSession({
      id,
      startTimestamp: new Date('2026-05-10T15:00:00.000Z'),
      endTimestamp: new Date('2026-05-10T16:00:00.000Z'),
      status: 'Accepted',
      ...overrides,
    });
  }

  it('test_should_create_a_pending_review_placeholder_for_a_past_session_that_lacks_one', async () => {
    const past1 = past('s_past', { reviews: [] });

    sessionRepo.findByStudent
      .mockResolvedValueOnce([past1])    // first read (decide which need review)
      .mockResolvedValueOnce([           // second read (re-fetch with review present)
        { ...past1, reviews: [{ id: 'rev_new', studentId: STUDENT_ID, tutorId: TUTOR_ID, rating: null, status: 'pending' }] },
      ]);

    await sessionService.getStudentHistory(STUDENT_ID);

    expect(reviewRepo.upsertReview).toHaveBeenCalledTimes(1);
    expect(reviewRepo.upsertReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's_past',
        studentId: STUDENT_ID,
        tutorId: TUTOR_ID,
        rating: null,
        status: 'pending',
      }),
    );
  });

  it('test_should_not_recreate_a_pending_review_when_one_already_exists', async () => {
    const sessionWithPending = past('s_past', {
      reviews: [
        { id: 'rev_existing', studentId: STUDENT_ID, tutorId: TUTOR_ID, rating: null, status: 'pending' },
      ],
    });
    sessionRepo.findByStudent.mockResolvedValue([sessionWithPending]);

    await sessionService.getStudentHistory(STUDENT_ID);

    expect(reviewRepo.upsertReview).not.toHaveBeenCalled();
  });

  it('test_should_skip_pending_review_creation_for_upcoming_sessions', async () => {
    sessionRepo.findByStudent.mockResolvedValue([upcoming('s_future')]);

    await sessionService.getStudentHistory(STUDENT_ID);

    expect(reviewRepo.upsertReview).not.toHaveBeenCalled();
  });

  it('test_should_attach_pendingReview_field_to_each_returned_session', async () => {
    const enriched = upcoming('s_future', {
      reviews: [
        { id: 'rev_p', studentId: STUDENT_ID, tutorId: TUTOR_ID, rating: null, status: 'pending' },
      ],
    });
    sessionRepo.findByStudent.mockResolvedValue([enriched]);

    const result = await sessionService.getStudentHistory(STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].pendingReview).toMatchObject({ id: 'rev_p', rating: null });
  });

  it('test_should_set_pendingReview_to_null_when_no_matching_pending_review_exists', async () => {
    const enriched = upcoming('s_future', { reviews: [] });
    sessionRepo.findByStudent.mockResolvedValue([enriched]);

    const result = await sessionService.getStudentHistory(STUDENT_ID);

    expect(result[0].pendingReview).toBeNull();
  });

  it('test_should_swallow_review_creation_errors_and_still_return_sessions', async () => {
    const past1 = past('s_past', { reviews: [] });
    sessionRepo.findByStudent
      .mockResolvedValueOnce([past1])
      .mockResolvedValueOnce([past1]);
    reviewRepo.upsertReview.mockRejectedValueOnce(new Error('DB down'));

    const result = await sessionService.getStudentHistory(STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s_past');
  });
});

// ─── splitPastUpcoming (pure helper) ────────────────────────────────

describe('splitPastUpcoming', () => {
  it('test_should_partition_a_mixed_list_relative_to_now', () => {
    const sessions = [
      makeSession({ id: 'past', endTimestamp: new Date('2026-04-01T00:00:00.000Z') }),
      makeSession({ id: 'future', endTimestamp: new Date('2026-05-01T00:00:00.000Z') }),
    ];
    const { past, upcoming } = splitPastUpcoming(sessions, NOW);
    expect(past.map((s) => s.id)).toEqual(['past']);
    expect(upcoming.map((s) => s.id)).toEqual(['future']);
  });

  it('test_should_return_empty_arrays_for_an_empty_input', () => {
    expect(splitPastUpcoming([], NOW)).toEqual({ past: [], upcoming: [] });
  });

  it('test_should_treat_a_session_ending_exactly_at_now_as_upcoming', () => {
    const sessions = [makeSession({ id: 'edge', endTimestamp: NOW })];
    const { past, upcoming } = splitPastUpcoming(sessions, NOW);
    expect(past).toEqual([]);
    expect(upcoming.map((s) => s.id)).toEqual(['edge']);
  });
});
