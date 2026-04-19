/**
 * Integration-style unit tests for session.service.bookPaidSession — the
 * domain API invoked from the Wompi webhook on APPROVED transactions.
 *
 * Collaborators are mocked at the module boundary so we exercise the real
 * validation, auto-accept decision, calendar sync, notification dispatch
 * and email fan-out inside session.service.
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
  upsertReview: jest.fn(),
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
jest.mock('@/lib/services/session-attachment.service', () => ({
  registerAttachments: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/services/calico-calendar.service', () => ({
  createTutoringSessionEvent: jest.fn(),
  cancelTutoringSessionEvent: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: { update: jest.fn(() => Promise.resolve()) },
  },
}));

const sessionRepo = require('@/lib/repositories/session.repository');
const availabilityRepo = require('@/lib/repositories/availability.repository');
const userRepo = require('@/lib/repositories/user.repository');
const reviewRepo = require('@/lib/repositories/review.repository');
const notificationService = require('@/lib/services/notification.service');
const emailService = require('@/lib/services/email.service');
const attachmentService = require('@/lib/services/session-attachment.service');
const calicoCalendar = require('@/lib/services/calico-calendar.service');
const sessionService = require('@/lib/services/session.service');

// Wed 2026-04-15, 15:00Z = 10:00 America/Bogota (UTC-5). Weekday (getDay) = 3.
const START = new Date('2026-04-15T15:00:00.000Z');
const END = new Date('2026-04-15T16:00:00.000Z');

function makeParticipantFixture() {
  return {
    id: 'sess_1',
    tutorId: 99,
    status: 'Accepted',
    startTimestamp: START,
    endTimestamp: END,
    course: { name: 'Cálculo' },
    googleMeetLink: '',
    tutor: { id: 99, name: 'Carlos Tutor', email: 'carlos@test.co' },
    participants: [
      { studentId: 42, student: { id: 42, name: 'Laura', email: 'laura@test.co' } },
    ],
  };
}

function stubHappyPathMocks({ withParticipants = true } = {}) {
  userRepo.findById.mockImplementation((id) => {
    if (id === 99) return Promise.resolve({ id: 99, name: 'Carlos Tutor', email: 'carlos@test.co', isTutorApproved: true });
    if (id === 42) return Promise.resolve({ id: 42, name: 'Laura', email: 'laura@test.co' });
    return Promise.resolve(null);
  });
  availabilityRepo.findScheduleByUserId.mockResolvedValue({
    timezone: 'America/Bogota',
    bufferTime: 15,
    maxSessionsPerDay: 5,
    autoAcceptSession: false, // explicitly OFF — refactor guarantees auto-accept regardless
  });
  // Block on Wed 09:00–12:00 (stored as @db.Time, i.e. string hh:mm:ss works)
  availabilityRepo.findAvailabilityByDay.mockResolvedValue([
    { dayOfWeek: 3, startTime: '09:00:00', endTime: '12:00:00' },
  ]);
  sessionRepo.countTutorSessionsOnDate.mockResolvedValue(0);

  const createdSession = {
    id: 'sess_1',
    tutorId: 99,
    status: 'Accepted',
    startTimestamp: START,
    endTimestamp: END,
    participants: withParticipants
      ? [{ studentId: 42, student: { id: 42, name: 'Laura', email: 'laura@test.co' } }]
      : [],
    course: { name: 'Cálculo' },
  };
  sessionRepo.createSessionWithParticipant.mockResolvedValue(createdSession);
  sessionRepo.findById.mockResolvedValue({
    ...makeParticipantFixture(),
    googleMeetLink: 'https://meet.google.com/abc-defg-hij',
  });
  reviewRepo.upsertReview.mockResolvedValue({ id: 'rev_1' });
  calicoCalendar.createTutoringSessionEvent.mockResolvedValue({
    success: true,
    eventId: 'evt_1',
    meetLink: 'https://meet.google.com/abc-defg-hij',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bookPaidSession — happy path', () => {
  beforeEach(stubHappyPathMocks);

  it('creates the session with status=Accepted regardless of schedule.autoAcceptSession', async () => {
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
      topicsToReview: 'Derivadas',
    });

    expect(sessionRepo.createSessionWithParticipant).toHaveBeenCalledTimes(1);
    const [sessionData, studentId, buffer] = sessionRepo.createSessionWithParticipant.mock.calls[0];
    expect(sessionData.status).toBe('Accepted');
    expect(sessionData.tutorId).toBe(99);
    expect(sessionData.topicsToReview).toBe('Derivadas');
    expect(studentId).toBe(42);
    expect(buffer).toBe(15);
  });

  it('registers attachments when provided', async () => {
    const atts = [{ s3Key: 'k', fileName: 'n.pdf', fileSize: 1, mimeType: 'application/pdf' }];
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
      attachments: atts,
    });

    expect(attachmentService.registerAttachments).toHaveBeenCalledWith('sess_1', atts);
  });

  it('skips attachment registration when the list is empty', async () => {
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
    });

    expect(attachmentService.registerAttachments).not.toHaveBeenCalled();
  });

  it('creates a pending review placeholder and a Google Calendar event', async () => {
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
    });

    expect(reviewRepo.upsertReview).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess_1',
        studentId: 42,
        tutorId: 99,
        status: 'pending',
        rating: null,
      }),
    );
    expect(calicoCalendar.createTutoringSessionEvent).toHaveBeenCalledTimes(1);
  });

  it('sends confirmation email (template 7) to both tutor and student with the Meet link', async () => {
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
    });

    expect(emailService.sendSessionConfirmedEmail).toHaveBeenCalledTimes(2);
    const recipients = emailService.sendSessionConfirmedEmail.mock.calls.map((c) => c[0]);
    expect(recipients).toEqual(expect.arrayContaining(['carlos@test.co', 'laura@test.co']));
    const payloads = emailService.sendSessionConfirmedEmail.mock.calls.map((c) => c[1]);
    for (const p of payloads) {
      expect(p.meetLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(p.courseName).toBe('Cálculo');
    }
  });

  it('notifies BOTH tutor (session_confirmed) and student (session_accepted) in-app', async () => {
    await sessionService.bookPaidSession({
      studentId: 42,
      tutorId: 99,
      courseId: 'course-uuid',
      startTimestamp: START,
      endTimestamp: END,
    });

    expect(notificationService.notifySessionAccepted).toHaveBeenCalledTimes(1);
    expect(notificationService.notifySessionConfirmedToTutor).toHaveBeenCalledTimes(1);
    expect(notificationService.notifySessionConfirmedToTutor).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sess_1', tutorId: 99 }),
      'Laura',
    );
  });
});

describe('bookPaidSession — validation & error propagation', () => {
  it('rejects self-booking (SELF_BOOKING)', async () => {
    await expect(
      sessionService.bookPaidSession({
        studentId: 7,
        tutorId: 7,
        courseId: 'c',
        startTimestamp: START,
        endTimestamp: END,
      }),
    ).rejects.toMatchObject({ code: 'SELF_BOOKING' });
  });

  it('rejects unapproved tutors (TUTOR_NOT_APPROVED)', async () => {
    userRepo.findById.mockResolvedValueOnce({ id: 99, isTutorApproved: false });

    await expect(
      sessionService.bookPaidSession({
        studentId: 42,
        tutorId: 99,
        courseId: 'c',
        startTimestamp: START,
        endTimestamp: END,
      }),
    ).rejects.toMatchObject({ code: 'TUTOR_NOT_APPROVED' });
  });

  it('rejects slots outside the tutor availability (OUTSIDE_AVAILABILITY)', async () => {
    stubHappyPathMocks();
    // Override: only a Mon block, we're booking Wed → mismatched day
    availabilityRepo.findAvailabilityByDay.mockResolvedValue([]);

    await expect(
      sessionService.bookPaidSession({
        studentId: 42,
        tutorId: 99,
        courseId: 'course-uuid',
        startTimestamp: START,
        endTimestamp: END,
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_AVAILABILITY' });

    expect(sessionRepo.createSessionWithParticipant).not.toHaveBeenCalled();
  });

  it('propagates SESSION_CONFLICT thrown by the repository', async () => {
    stubHappyPathMocks();
    const conflict = new Error('Slot taken');
    conflict.code = 'SESSION_CONFLICT';
    sessionRepo.createSessionWithParticipant.mockRejectedValueOnce(conflict);

    await expect(
      sessionService.bookPaidSession({
        studentId: 42,
        tutorId: 99,
        courseId: 'course-uuid',
        startTimestamp: START,
        endTimestamp: END,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });

    // no downstream effects if session creation failed
    expect(attachmentService.registerAttachments).not.toHaveBeenCalled();
    expect(emailService.sendSessionConfirmedEmail).not.toHaveBeenCalled();
    expect(notificationService.notifySessionConfirmedToTutor).not.toHaveBeenCalled();
  });
});
