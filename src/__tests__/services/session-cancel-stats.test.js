/**
 * Tests for session cancellation and tutor statistics update
 * Verifies that tutor profile stats (numSessions, totalEarning) are properly 
 * decremented when a session is cancelled
 */

jest.mock('@/lib/repositories/session.repository', () => ({
  updateSession: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('@/lib/repositories/availability.repository', () => ({
  findAvailabilityByUserId: jest.fn(),
  findScheduleByUserId: jest.fn(),
}));

jest.mock('@/lib/repositories/payment.repository', () => ({
  findBySessionId: jest.fn(),
}));

jest.mock('@/lib/repositories/tutor-profile.repository', () => ({
  decrementStats: jest.fn(),
  incrementStats: jest.fn(),
}));

jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
}));

jest.mock('@/lib/services/notification.service', () => ({
  notifySessionCancelled: jest.fn(),
  notifySessionCompleted: jest.fn(),
}));

jest.mock('@/lib/services/calico-calendar.service', () => ({
  cancelTutoringSessionEvent: jest.fn(),
  createTutoringSessionEvent: jest.fn(),
}));

jest.mock('@/lib/repositories/review.repository', () => ({
  createPendingReview: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: { update: jest.fn(() => Promise.resolve()) },
  },
}));

const sessionService = require('@/lib/services/session.service');
const sessionRepo = require('@/lib/repositories/session.repository');
const paymentRepo = require('@/lib/repositories/payment.repository');
const tutorProfileRepo = require('@/lib/repositories/tutor-profile.repository');
const notificationService = require('@/lib/services/notification.service');
const calicoCalendar = require('@/lib/services/calico-calendar.service');

describe('Session Cancellation & Tutor Statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cancelSession', () => {
    it('should decrement tutor stats when cancelling a paid Accepted session', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const studentId = 'student_789';
      const paymentAmount = 50000;

      // Mock session
      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        googleCalendarEventId: 'evt_123',
        participants: [{ studentId }],
      };

      // Mock payment
      const mockPayment = {
        id: 'pay_123',
        status: 'paid',
        amount: paymentAmount,
        sessionId,
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Canceled' });
      paymentRepo.findBySessionId.mockResolvedValue(mockPayment);
      tutorProfileRepo.decrementStats.mockResolvedValue({});
      calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});

      const result = await sessionService.cancelSession(sessionId, tutorId);

      // Verify stats were decremented
      expect(tutorProfileRepo.decrementStats).toHaveBeenCalledWith(tutorId, paymentAmount);

      // Verify session was updated
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(sessionId, { status: 'Canceled' });

      // Verify notification was sent
      expect(notificationService.notifySessionCancelled).toHaveBeenCalled();

      // Verify calendar event was cancelled
      expect(calicoCalendar.cancelTutoringSessionEvent).toHaveBeenCalledWith('evt_123');
    });

    it('should NOT decrement stats for a pending payment when cancelling', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const studentId = 'student_789';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        googleCalendarEventId: 'evt_123',
        participants: [{ studentId }],
      };

      const mockPayment = {
        id: 'pay_123',
        status: 'pending', // Not paid yet
        amount: 50000,
        sessionId,
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Canceled' });
      paymentRepo.findBySessionId.mockResolvedValue(mockPayment);
      calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});

      await sessionService.cancelSession(sessionId, tutorId);

      // Stats should NOT be decremented for pending payments
      expect(tutorProfileRepo.decrementStats).not.toHaveBeenCalled();
    });

    it('should NOT decrement stats when there is no payment', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const studentId = 'student_789';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        googleCalendarEventId: 'evt_123',
        participants: [{ studentId }],
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Canceled' });
      paymentRepo.findBySessionId.mockResolvedValue(null); // No payment
      calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});

      await sessionService.cancelSession(sessionId, tutorId);

      // Stats should NOT be decremented
      expect(tutorProfileRepo.decrementStats).not.toHaveBeenCalled();
    });

    it('should reject cancellation when tutor is neither tutor nor participant', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const studentId = 'student_789';
      const otherUserId = 'other_user_999';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        participants: [{ studentId }],
      };

      sessionRepo.findById.mockResolvedValue(mockSession);

      await expect(sessionService.cancelSession(sessionId, otherUserId))
        .rejects
        .toThrow('No tienes permiso para cancelar esta sesión');

      // Stats should NOT be modified
      expect(tutorProfileRepo.decrementStats).not.toHaveBeenCalled();
    });

    it('should reject cancellation of already Completed session', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Completed', // Already completed
        participants: [],
      };

      sessionRepo.findById.mockResolvedValue(mockSession);

      await expect(sessionService.cancelSession(sessionId, tutorId))
        .rejects
        .toThrow('No se puede cancelar una sesión con status "Completed"');

      // Stats should NOT be modified
      expect(tutorProfileRepo.decrementStats).not.toHaveBeenCalled();
    });

    it('should allow student to cancel session', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const studentId = 'student_789';
      const paymentAmount = 50000;

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        googleCalendarEventId: 'evt_123',
        participants: [{ studentId }],
      };

      const mockPayment = {
        id: 'pay_123',
        status: 'paid',
        amount: paymentAmount,
        sessionId,
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Canceled' });
      paymentRepo.findBySessionId.mockResolvedValue(mockPayment);
      tutorProfileRepo.decrementStats.mockResolvedValue({});
      calicoCalendar.cancelTutoringSessionEvent.mockResolvedValue({});

      // Student should be able to cancel
      const result = await sessionService.cancelSession(sessionId, studentId);

      // Verify stats were decremented
      expect(tutorProfileRepo.decrementStats).toHaveBeenCalledWith(tutorId, paymentAmount);
    });
  });

  describe('completeSession', () => {
    it('should increment tutor stats when completing a paid session', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const paymentAmount = 50000;

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        participants: [],
      };

      const mockPayment = {
        id: 'pay_123',
        status: 'paid',
        amount: paymentAmount,
        sessionId,
      };

      const mockTutor = {
        id: tutorId,
        name: 'Tutor Name',
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Completed' });
      paymentRepo.findBySessionId.mockResolvedValue(mockPayment);
      tutorProfileRepo.incrementStats.mockResolvedValue({});

      const userRepo = require('@/lib/repositories/user.repository');
      userRepo.findById = jest.fn().mockResolvedValue(mockTutor);

      const reviewRepo = require('@/lib/repositories/review.repository');
      reviewRepo.createPendingReview = jest.fn().mockResolvedValue({});

      await sessionService.completeSession(sessionId, tutorId);

      // Verify stats were incremented
      expect(tutorProfileRepo.incrementStats).toHaveBeenCalledWith(tutorId, paymentAmount);

      // Verify session was updated
      expect(sessionRepo.updateSession).toHaveBeenCalledWith(sessionId, { status: 'Completed' });
    });

    it('should NOT increment stats for a pending payment', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
        participants: [],
      };

      const mockPayment = {
        id: 'pay_123',
        status: 'pending', // Not paid yet
        amount: 50000,
        sessionId,
      };

      const mockTutor = {
        id: tutorId,
        name: 'Tutor Name',
      };

      sessionRepo.findById.mockResolvedValue(mockSession);
      sessionRepo.updateSession.mockResolvedValue({ ...mockSession, status: 'Completed' });
      paymentRepo.findBySessionId.mockResolvedValue(mockPayment);

      const userRepo = require('@/lib/repositories/user.repository');
      userRepo.findById = jest.fn().mockResolvedValue(mockTutor);

      const reviewRepo = require('@/lib/repositories/review.repository');
      reviewRepo.createPendingReview = jest.fn().mockResolvedValue({});

      await sessionService.completeSession(sessionId, tutorId);

      // Stats should NOT be incremented for pending payments
      expect(tutorProfileRepo.incrementStats).not.toHaveBeenCalled();
    });

    it('should reject completion if not the tutor', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';
      const wrongUserId = 'wrong_user_789';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Accepted',
      };

      sessionRepo.findById.mockResolvedValue(mockSession);

      await expect(sessionService.completeSession(sessionId, wrongUserId))
        .rejects
        .toThrow('Solo el tutor asignado puede completar esta sesión');

      // Stats should NOT be modified
      expect(tutorProfileRepo.incrementStats).not.toHaveBeenCalled();
    });

    it('should reject completion if session is not Accepted', async () => {
      const sessionId = 'sess_123';
      const tutorId = 'tutor_456';

      const mockSession = {
        id: sessionId,
        tutorId,
        status: 'Pending', // Not accepted yet
      };

      sessionRepo.findById.mockResolvedValue(mockSession);

      await expect(sessionService.completeSession(sessionId, tutorId))
        .rejects
        .toThrow('No se puede completar una sesión con status "Pending"');

      // Stats should NOT be modified
      expect(tutorProfileRepo.incrementStats).not.toHaveBeenCalled();
    });
  });
});
