/**
 * Unit tests — Booking Process (sessionService.createSession)
 *
 * createSession is the core booking primitive. The student hits this when
 * selecting a slot. Behavior under test:
 *   - Status defaults to 'Pending' unless schedule.autoAcceptSession is true
 *     (or forceAutoAccept is passed by an internal caller).
 *   - Self-booking is rejected.
 *   - Unapproved tutors are rejected.
 *   - Slots outside the tutor's weekly availability are rejected
 *     (timezone-correctly: matched in the tutor's IANA tz, not UTC).
 *   - maxSessionsPerDay caps the booking rate.
 *   - Repository SESSION_CONFLICT (overlap) bubbles up unchanged.
 *
 * Payment-driven tests already live in `session.service.bookPaid.test.js` —
 * we explicitly cover the manual/Pending path here.
 */

jest.mock('@/lib/repositories/session.repository', () => ({
  createSessionWithParticipant: jest.fn(),
  findById: jest.fn(),
  countTutorSessionsOnDate: jest.fn(),
}));
jest.mock('@/lib/repositories/availability.repository', () => ({
  findScheduleByUserId: jest.fn(),
  findAvailabilityByDay: jest.fn(),
}));
jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
}));
jest.mock('@/lib/repositories/review.repository', () => ({
  upsertReview: jest.fn(() => Promise.resolve({ id: 'rev_1' })),
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
jest.mock('@/lib/services/email.service', () => ({
  sendSessionConfirmedEmail: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/services/calico-calendar.service', () => ({
  createTutoringSessionEvent: jest.fn(() =>
    Promise.resolve({ success: true, eventId: 'evt_1', meetLink: 'https://meet.google.com/x' }),
  ),
  cancelTutoringSessionEvent: jest.fn(),
}));
jest.mock('@/lib/services/session-attachment.service', () => ({
  registerAttachments: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { session: { update: jest.fn(() => Promise.resolve()) } },
}));

const sessionRepo = require('@/lib/repositories/session.repository');
const availabilityRepo = require('@/lib/repositories/availability.repository');
const userRepo = require('@/lib/repositories/user.repository');
const calicoCalendar = require('@/lib/services/calico-calendar.service');
const sessionService = require('@/lib/services/session.service');

const {
  ANCHOR_START,
  ANCHOR_END,
  makeSchedule,
  makeAvailabilityBlock,
  makeSession,
} = require('../fixtures/booking.fixtures');

// ─── Common stubbing — happy path ───────────────────────────────────

function stubHappyPath(scheduleOverrides = {}) {
  userRepo.findById.mockResolvedValue({
    id: 99,
    name: 'Carlos Tutor',
    email: 'carlos@test.co',
    isTutorApproved: true,
  });
  availabilityRepo.findScheduleByUserId.mockResolvedValue(makeSchedule(scheduleOverrides));
  availabilityRepo.findAvailabilityByDay.mockResolvedValue([makeAvailabilityBlock()]);
  sessionRepo.countTutorSessionsOnDate.mockResolvedValue(0);
  sessionRepo.createSessionWithParticipant.mockResolvedValue(makeSession({ status: 'Pending' }));
}

const baseData = {
  courseId: 'course-uuid-cal-1',
  tutorId: 99,
  sessionType: 'Individual',
  startTimestamp: ANCHOR_START,
  endTimestamp: ANCHOR_END,
  locationType: 'Virtual',
  topicsToReview: 'Derivadas',
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Status branching (Pending vs Accepted) ─────────────────────────

describe('createSession — status branching', () => {
  it('test_should_create_with_status_Pending_when_autoAcceptSession_is_false', async () => {
    stubHappyPath({ autoAcceptSession: false });

    await sessionService.createSession(42, baseData);

    const [sessionData] = sessionRepo.createSessionWithParticipant.mock.calls[0];
    expect(sessionData.status).toBe('Pending');
  });

  it('test_should_create_with_status_Accepted_when_autoAcceptSession_is_true', async () => {
    stubHappyPath({ autoAcceptSession: true });
    sessionRepo.createSessionWithParticipant.mockResolvedValueOnce(
      makeSession({ status: 'Accepted' }),
    );

    await sessionService.createSession(42, baseData);

    const [sessionData] = sessionRepo.createSessionWithParticipant.mock.calls[0];
    expect(sessionData.status).toBe('Accepted');
    // Auto-accept must trigger calendar event creation
    expect(calicoCalendar.createTutoringSessionEvent).toHaveBeenCalledTimes(1);
  });

  it('test_should_skip_calendar_event_when_session_starts_as_Pending', async () => {
    stubHappyPath({ autoAcceptSession: false });

    await sessionService.createSession(42, baseData);

    expect(calicoCalendar.createTutoringSessionEvent).not.toHaveBeenCalled();
  });

  it('test_should_force_Accepted_when_caller_passes_forceAutoAccept_even_if_schedule_disables_it', async () => {
    stubHappyPath({ autoAcceptSession: false });
    sessionRepo.createSessionWithParticipant.mockResolvedValueOnce(
      makeSession({ status: 'Accepted' }),
    );

    await sessionService.createSession(42, baseData, { forceAutoAccept: true });

    const [sessionData] = sessionRepo.createSessionWithParticipant.mock.calls[0];
    expect(sessionData.status).toBe('Accepted');
  });
});

// ─── Validation ─────────────────────────────────────────────────────

describe('createSession — validation', () => {
  it('test_should_fail_when_student_tries_to_book_themselves_with_SELF_BOOKING', async () => {
    await expect(
      sessionService.createSession(7, { ...baseData, tutorId: 7 }),
    ).rejects.toMatchObject({ code: 'SELF_BOOKING' });

    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it('test_should_fail_when_tutor_is_not_approved_with_TUTOR_NOT_APPROVED', async () => {
    userRepo.findById.mockResolvedValueOnce({ id: 99, isTutorApproved: false });

    await expect(sessionService.createSession(42, baseData)).rejects.toMatchObject({
      code: 'TUTOR_NOT_APPROVED',
    });
  });

  it('test_should_fail_when_tutor_does_not_exist_with_TUTOR_NOT_APPROVED', async () => {
    userRepo.findById.mockResolvedValueOnce(null);

    await expect(sessionService.createSession(42, baseData)).rejects.toMatchObject({
      code: 'TUTOR_NOT_APPROVED',
    });
  });

  it('test_should_fail_when_start_is_after_end_with_INVALID_TIMES', async () => {
    stubHappyPath();

    await expect(
      sessionService.createSession(42, {
        ...baseData,
        startTimestamp: ANCHOR_END,
        endTimestamp: ANCHOR_START,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TIMES' });
  });

  it('test_should_fail_when_session_spans_two_local_days_in_tutor_timezone_with_INVALID_TIMES', async () => {
    stubHappyPath();
    // Bogota is UTC-5. A session 04:00Z→06:00Z = 23:00→01:00 BOG, crossing midnight.
    await expect(
      sessionService.createSession(42, {
        ...baseData,
        startTimestamp: new Date('2026-04-16T04:00:00.000Z'),
        endTimestamp: new Date('2026-04-16T06:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TIMES' });
  });

  it('test_should_fail_when_slot_falls_outside_any_tutor_block_with_OUTSIDE_AVAILABILITY', async () => {
    stubHappyPath();
    availabilityRepo.findAvailabilityByDay.mockResolvedValue([]); // no Wed blocks

    await expect(sessionService.createSession(42, baseData)).rejects.toMatchObject({
      code: 'OUTSIDE_AVAILABILITY',
    });
    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it('test_should_fail_when_tutor_already_at_max_sessions_for_the_day_with_MAX_SESSIONS_REACHED', async () => {
    stubHappyPath({ maxSessionsPerDay: 3 });
    sessionRepo.countTutorSessionsOnDate.mockResolvedValue(3);

    await expect(sessionService.createSession(42, baseData)).rejects.toMatchObject({
      code: 'MAX_SESSIONS_REACHED',
    });
  });
});

// ─── Timezone correctness (regression-pin for the Bogota/UTC mapping) ─

describe('createSession — timezone-aware availability matching', () => {
  it('test_should_accept_a_slot_whose_UTC_instant_maps_to_the_tutor_local_block', async () => {
    // Block 09:00–12:00 BOG. 15:00Z = 10:00 BOG ✓
    stubHappyPath();

    await sessionService.createSession(42, baseData);

    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledTimes(1);
  });

  it('test_should_reject_a_slot_that_lies_outside_local_block_even_if_UTC_appears_inside', async () => {
    // 13:00Z = 08:00 BOG → before the 09:00 block start
    stubHappyPath();
    await expect(
      sessionService.createSession(42, {
        ...baseData,
        startTimestamp: new Date('2026-04-15T13:00:00.000Z'),
        endTimestamp: new Date('2026-04-15T14:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_AVAILABILITY' });
  });

  it('test_should_use_a_different_timezone_when_the_tutor_schedule_specifies_one', async () => {
    // Mexico City (UTC-6). 16:00Z = 10:00 CDMX → falls into 09–12 block.
    stubHappyPath({ timezone: 'America/Mexico_City' });
    availabilityRepo.findAvailabilityByDay.mockResolvedValue([
      makeAvailabilityBlock({ dayOfWeek: 3, startTime: '09:00:00', endTime: '12:00:00' }),
    ]);

    await sessionService.createSession(42, {
      ...baseData,
      startTimestamp: new Date('2026-04-15T16:00:00.000Z'),
      endTimestamp: new Date('2026-04-15T17:00:00.000Z'),
    });

    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledTimes(1);
  });
});

// ─── Conflict propagation ────────────────────────────────────────────

describe('createSession — overlap / conflict', () => {
  it('test_should_fail_when_booking_an_already_occupied_slot_with_SESSION_CONFLICT', async () => {
    stubHappyPath();
    const conflict = new Error('Slot taken');
    conflict.code = 'SESSION_CONFLICT';
    sessionRepo.createSessionWithParticipant.mockRejectedValueOnce(conflict);

    await expect(sessionService.createSession(42, baseData)).rejects.toMatchObject({
      code: 'SESSION_CONFLICT',
    });
  });
});
