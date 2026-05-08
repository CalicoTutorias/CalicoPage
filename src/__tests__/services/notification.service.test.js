/**
 * Unit tests for notification.service.js
 * Mocks the notification repository to verify business logic only.
 */

// Manual mock factory — avoids loading Prisma
jest.mock('@/lib/repositories/notification.repository', () => ({
  create: jest.fn(),
  findByUserId: jest.fn(),
  findById: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  deleteById: jest.fn(),
  countUnread: jest.fn(),
}));

const notificationRepo = require('@/lib/repositories/notification.repository');
const notificationService = require('@/lib/services/notification.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── getUserNotifications ─────────────────────────────────────────────

describe('getUserNotifications', () => {
  it('returns notifications from the repository', async () => {
    const mockNotifications = [
      { id: '1', userId: 1, type: 'session_accepted', message: 'Accepted', isRead: false },
      { id: '2', userId: 1, type: 'review_reminder', message: 'Rate!', isRead: true },
    ];
    notificationRepo.findByUserId.mockResolvedValue(mockNotifications);

    const result = await notificationService.getUserNotifications(1, { limit: 10 });

    expect(notificationRepo.findByUserId).toHaveBeenCalledWith(1, { limit: 10, unreadOnly: false });
    expect(result).toEqual(mockNotifications);
  });

  it('passes unreadOnly option', async () => {
    notificationRepo.findByUserId.mockResolvedValue([]);

    await notificationService.getUserNotifications(1, { limit: 50, unreadOnly: true });

    expect(notificationRepo.findByUserId).toHaveBeenCalledWith(1, { limit: 50, unreadOnly: true });
  });
});

// ─── markAsRead ───────────────────────────────────────────────────────

describe('markAsRead', () => {
  it('marks the notification as read if owned by the user', async () => {
    notificationRepo.findById.mockResolvedValue({ id: 'n1', userId: 5 });
    notificationRepo.markAsRead.mockResolvedValue({ id: 'n1', userId: 5, isRead: true });

    const result = await notificationService.markAsRead('n1', 5);

    expect(notificationRepo.findById).toHaveBeenCalledWith('n1');
    expect(notificationRepo.markAsRead).toHaveBeenCalledWith('n1');
    expect(result.isRead).toBe(true);
  });

  it('throws NOT_FOUND when notification does not exist', async () => {
    notificationRepo.findById.mockResolvedValue(null);

    await expect(notificationService.markAsRead('bad', 5)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(notificationRepo.markAsRead).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when notification belongs to a different user', async () => {
    notificationRepo.findById.mockResolvedValue({ id: 'n1', userId: 99 });

    await expect(notificationService.markAsRead('n1', 5)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(notificationRepo.markAsRead).not.toHaveBeenCalled();
  });
});

// ─── markAllAsRead ────────────────────────────────────────────────────

describe('markAllAsRead', () => {
  it('delegates to the repository', async () => {
    notificationRepo.markAllAsRead.mockResolvedValue({ count: 3 });

    const result = await notificationService.markAllAsRead(5);

    expect(notificationRepo.markAllAsRead).toHaveBeenCalledWith(5);
    expect(result.count).toBe(3);
  });
});

// ─── deleteNotification ───────────────────────────────────────────────

describe('deleteNotification', () => {
  it('deletes notification owned by user', async () => {
    notificationRepo.findById.mockResolvedValue({ id: 'n1', userId: 5 });
    notificationRepo.deleteById.mockResolvedValue({ id: 'n1' });

    await notificationService.deleteNotification('n1', 5);

    expect(notificationRepo.deleteById).toHaveBeenCalledWith('n1');
  });

  it('throws NOT_FOUND when notification belongs to someone else', async () => {
    notificationRepo.findById.mockResolvedValue({ id: 'n1', userId: 99 });

    await expect(notificationService.deleteNotification('n1', 5)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(notificationRepo.deleteById).not.toHaveBeenCalled();
  });
});

// ─── Fire-and-forget notification helpers ─────────────────────────────

describe('notifySessionAccepted', () => {
  it('creates a notification for each participant', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    const session = {
      id: 'sess1',
      tutorId: 10,
      course: { name: 'Cálculo' },
      participants: [{ studentId: 1 }, { studentId: 2 }],
    };

    await notificationService.notifySessionAccepted(session, 'Carlos');

    expect(notificationRepo.create).toHaveBeenCalledTimes(2);
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        type: 'session_accepted',
        sessionId: 'sess1',
      }),
    );
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        type: 'session_accepted',
      }),
    );
  });

  it('does not throw if repo.create fails', async () => {
    notificationRepo.create.mockRejectedValue(new Error('DB down'));

    const session = {
      id: 'sess1',
      tutorId: 10,
      course: { name: 'Cálculo' },
      participants: [{ studentId: 1 }],
    };

    // Should resolve without throwing
    await expect(
      notificationService.notifySessionAccepted(session, 'Carlos'),
    ).resolves.not.toThrow();
  });
});

describe('notifySessionConfirmedToTutor', () => {
  it('creates a session_confirmed notification addressed to the tutor', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    const session = {
      id: 'sess1',
      tutorId: 10,
      course: { name: 'Cálculo' },
    };

    await notificationService.notifySessionConfirmedToTutor(session, 'Laura');

    expect(notificationRepo.create).toHaveBeenCalledTimes(1);
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'session_confirmed',
        sessionId: 'sess1',
        metadata: expect.objectContaining({ studentName: 'Laura', courseName: 'Cálculo' }),
      }),
    );
  });

  it('falls back to "Tutoría" when course name is missing', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifySessionConfirmedToTutor({ id: 'sess2', tutorId: 7 }, 'Ana');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ courseName: 'Tutoría' }),
      }),
    );
  });

  it('swallows repository failures (fire-and-forget)', async () => {
    notificationRepo.create.mockRejectedValue(new Error('DB down'));

    await expect(
      notificationService.notifySessionConfirmedToTutor({ id: 'sess1', tutorId: 10 }, 'Laura'),
    ).resolves.not.toThrow();
  });
});

describe('notifySessionCancelled', () => {
  it('notifies tutor when a student cancels', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    const session = {
      id: 'sess1',
      tutorId: 10,
      course: { name: 'Física' },
      participants: [
        { studentId: 3, student: { name: 'Laura' } },
      ],
    };

    await notificationService.notifySessionCancelled(session, 3);

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'session_cancelled',
        metadata: expect.objectContaining({ cancelledBy: 'student' }),
      }),
    );
  });

  it('notifies all students when tutor cancels', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    const session = {
      id: 'sess1',
      tutorId: 10,
      tutor: { name: 'Prof. García' },
      course: { name: 'Física' },
      participants: [{ studentId: 1 }, { studentId: 2 }],
    };

    await notificationService.notifySessionCancelled(session, 10);

    expect(notificationRepo.create).toHaveBeenCalledTimes(2);
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, type: 'session_cancelled' }),
    );
    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 2, type: 'session_cancelled' }),
    );
  });
});

describe('notifyReviewReceived', () => {
  it('creates a review_received notification for the tutor', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyReviewReceived(10, 'Laura', 5, 'sess1');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 10,
        type: 'review_received',
        sessionId: 'sess1',
        metadata: expect.objectContaining({ studentName: 'Laura', rating: 5 }),
      }),
    );
  });
});

describe('notifyPaymentFailed', () => {
  it('creates a payment_failed notification', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyPaymentFailed(1, 'TXN-123');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        type: 'payment_failed',
        metadata: { reference: 'TXN-123' },
      }),
    );
  });
});

// ─── Tutor approval/rejection events ──────────────────────────────────

describe('notifyTutorApproved', () => {
  it('creates a tutor_approved notification', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyTutorApproved('user-123');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'tutor_approved',
        message: expect.stringContaining('Felicidades'),
      }),
    );
  });

  it('swallows repository failures (fire-and-forget)', async () => {
    notificationRepo.create.mockRejectedValue(new Error('DB down'));

    await expect(
      notificationService.notifyTutorApproved('user-123'),
    ).resolves.not.toThrow();
  });
});

describe('notifyTutorRejected', () => {
  it('creates a tutor_rejected notification without reason', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyTutorRejected('user-123');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'tutor_rejected',
        metadata: { reason: null },
      }),
    );
  });

  it('creates a tutor_rejected notification with reason', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyTutorRejected('user-123', 'Insufficient experience');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        type: 'tutor_rejected',
        metadata: { reason: 'Insufficient experience' },
      }),
    );
  });
});

// ─── Course approval/rejection events ──────────────────────────────────

describe('notifyCourseApproved', () => {
  it('creates a course_approved notification', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyCourseApproved('tutor-456', 'Cálculo I');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tutor-456',
        type: 'course_approved',
        message: expect.stringContaining('Cálculo I'),
        metadata: { courseName: 'Cálculo I' },
      }),
    );
  });

  it('swallows repository failures (fire-and-forget)', async () => {
    notificationRepo.create.mockRejectedValue(new Error('DB down'));

    await expect(
      notificationService.notifyCourseApproved('tutor-456', 'Cálculo I'),
    ).resolves.not.toThrow();
  });
});

describe('notifyCourseRejected', () => {
  it('creates a course_rejected notification without reason', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyCourseRejected('tutor-456', 'Física II');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tutor-456',
        type: 'course_rejected',
        metadata: { courseName: 'Física II', reason: null },
      }),
    );
  });

  it('creates a course_rejected notification with reason', async () => {
    notificationRepo.create.mockResolvedValue({ id: 'new' });

    await notificationService.notifyCourseRejected('tutor-456', 'Física II', 'Need more samples');

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'tutor-456',
        type: 'course_rejected',
        metadata: { courseName: 'Física II', reason: 'Need more samples' },
      }),
    );
  });
});
