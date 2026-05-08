/**
 * Integration tests: Session lifecycle notifications
 * Verifies that notifications are properly triggered when sessions are created, cancelled, and completed.
 */

// Mock prisma first before importing anything that uses it
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@/lib/repositories/notification.repository');
jest.mock('@/lib/services/notification.service');

const notificationService = require('@/lib/services/notification.service');

// Mock all the dependencies that session.service needs
jest.mock('@/lib/repositories/session.repository');
jest.mock('@/lib/repositories/availability.repository');
jest.mock('@/lib/repositories/user.repository');
jest.mock('@/lib/repositories/review.repository');
jest.mock('@/lib/repositories/tutor-profile.repository');
jest.mock('@/lib/repositories/payment.repository');
jest.mock('@/lib/services/calico-calendar.service');
jest.mock('@/lib/services/email.service');
jest.mock('@/lib/services/session-attachment.service');

const sessionRepo = require('@/lib/repositories/session.repository');
const availabilityRepo = require('@/lib/repositories/availability.repository');
const userRepo = require('@/lib/repositories/user.repository');
const reviewRepo = require('@/lib/repositories/review.repository');
const tutorProfileRepo = require('@/lib/repositories/tutor-profile.repository');
const paymentRepo = require('@/lib/repositories/payment.repository');
const calicoCalendar = require('@/lib/services/calico-calendar.service');
const emailService = require('@/lib/services/email.service');

const sessionService = require('@/lib/services/session.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Session completion notifications ────────────────────────────────

describe('Session Completion — Notifications', () => {
  it('sends review reminder notification to all students when session completes', async () => {
    const tutor = { id: 'tutor-1', name: 'Prof. García', email: 'prof@example.com' };
    const student1 = { id: 'student-1', name: 'Alice' };
    const student2 = { id: 'student-2', name: 'Bob' };

    const session = {
      id: 'sess-1',
      tutorId: 'tutor-1',
      status: 'Accepted',
      course: { name: 'Cálculo' },
      participants: [
        { studentId: 'student-1', student: student1 },
        { studentId: 'student-2', student: student2 },
      ],
      tutor,
    };

    sessionRepo.findById.mockResolvedValue(session);
    sessionRepo.updateSession.mockResolvedValue({ ...session, status: 'Completed' });
    userRepo.findById.mockResolvedValue(tutor);
    paymentRepo.findBySessionId.mockResolvedValue(null);
    reviewRepo.upsertReview.mockResolvedValue({});
    notificationService.notifySessionCompleted.mockResolvedValue([{}, {}]);

    const result = await sessionService.completeSession('sess-1', 'tutor-1');

    expect(result.status).toBe('Completed');
    expect(notificationService.notifySessionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sess-1', tutorId: 'tutor-1' }),
      'Prof. García',
    );
  });
});

// ─── Session cancellation notifications ──────────────────────────────

describe('Session Cancellation — Notifications', () => {
  it('notifies tutor when student cancels session', async () => {
    const session = {
      id: 'sess-3',
      tutorId: 'tutor-1',
      status: 'Accepted',
      course: { name: 'Cálculo' },
      participants: [{ studentId: 'student-1', student: { name: 'Alice' } }],
      googleCalendarEventId: 'event-123',
    };

    sessionRepo.findById.mockResolvedValue(session);
    sessionRepo.updateSession.mockResolvedValue({ ...session, status: 'Canceled' });
    paymentRepo.findBySessionId.mockResolvedValue({ status: 'paid', amount: 50000 });
    tutorProfileRepo.decrementStats.mockResolvedValue({});
    calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});
    notificationService.notifySessionCancelled.mockResolvedValue({});

    const result = await sessionService.cancelSession('sess-3', 'student-1');

    expect(result.status).toBe('Canceled');
    expect(notificationService.notifySessionCancelled).toHaveBeenCalledWith(session, 'student-1');
  });

  it('notifies all students when tutor cancels session', async () => {
    const session = {
      id: 'sess-4',
      tutorId: 'tutor-1',
      status: 'Accepted',
      course: { name: 'Física' },
      participants: [
        { studentId: 'student-1', student: { name: 'Alice' } },
        { studentId: 'student-2', student: { name: 'Bob' } },
      ],
      googleCalendarEventId: 'event-456',
    };

    sessionRepo.findById.mockResolvedValue(session);
    sessionRepo.updateSession.mockResolvedValue({ ...session, status: 'Canceled' });
    paymentRepo.findBySessionId.mockResolvedValue({ status: 'paid', amount: 50000 });
    tutorProfileRepo.decrementStats.mockResolvedValue({});
    calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});
    notificationService.notifySessionCancelled.mockResolvedValue({});

    const result = await sessionService.cancelSession('sess-4', 'tutor-1');

    expect(result.status).toBe('Canceled');
    expect(notificationService.notifySessionCancelled).toHaveBeenCalledWith(session, 'tutor-1');
  });
});

// ─── Session acceptance notifications ────────────────────────────────

describe('Session Acceptance — Notifications', () => {
  it('notifies students when tutor accepts pending session', async () => {
    const tutor = { id: 'tutor-1', name: 'Prof. García' };
    const session = {
      id: 'sess-6',
      tutorId: 'tutor-1',
      status: 'Pending',
      course: { name: 'Cálculo' },
      participants: [
        { studentId: 'student-1', student: { name: 'Alice' } },
        { studentId: 'student-2', student: { name: 'Bob' } },
      ],
      tutor,
    };

    sessionRepo.findById.mockResolvedValue(session);
    sessionRepo.updateSession.mockResolvedValue({ ...session, status: 'Accepted' });
    userRepo.findById.mockResolvedValue(tutor);
    calicoCalendar.createTutoringSessionEvent.mockResolvedValue({});
    notificationService.notifySessionAccepted.mockResolvedValue([{}, {}]);

    const result = await sessionService.acceptSession('sess-6', 'tutor-1');

    expect(result.status).toBe('Accepted');
    expect(notificationService.notifySessionAccepted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sess-6', tutorId: 'tutor-1' }),
      'Prof. García',
    );
  });
});
