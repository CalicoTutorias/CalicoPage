/**
 * @jest-environment node
 *
 * admin-session-detail.service — admin detail of a session, handing it to
 * another tutor and canceling it: what blocks each action, what is refused
 * before writing, and that calendar/email failures never undo the change.
 */

jest.mock('@/lib/s3', () => ({ generateDownloadUrl: jest.fn(async (key) => `https://s3.test/${key}`) }));
jest.mock('@/lib/repositories/session.repository', () => ({
  findAdminDetailById: jest.fn(),
  findByTutorInRange: jest.fn(),
  reassignTutor: jest.fn(),
  cancelByAdmin: jest.fn(),
  findUpcomingActiveIdsByTutor: jest.fn(),
}));
jest.mock('@/lib/repositories/academic.repository', () => ({ findOfferingTutorsForCourse: jest.fn() }));
jest.mock('@/lib/services/calico-calendar.service', () => ({
  replaceTutoringSessionTutor: jest.fn(),
  cancelTutoringSessionEvent: jest.fn(),
}));
jest.mock('@/lib/services/email.service', () => ({
  sendSessionConfirmedEmail: jest.fn(),
  sendSessionCancellationToStudent: jest.fn(),
  sendSessionCancellationToTutor: jest.fn(),
}));
jest.mock('@/lib/services/notification.service', () => ({
  notifySessionReassigned: jest.fn(),
  notifySessionCancelledByCalico: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { SESSION_REASSIGN_TUTOR: 'SESSION_REASSIGN_TUTOR', SESSION_CANCEL: 'SESSION_CANCEL' },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/session.service', () => ({
  sessionConfirmedEmailParams: jest.fn((session, tutor) => ({ tutorName: tutor.name, meetLink: session.googleMeetLink })),
}));

const sessionRepo = require('@/lib/repositories/session.repository');
const academicRepo = require('@/lib/repositories/academic.repository');
const calendar = require('@/lib/services/calico-calendar.service');
const emailService = require('@/lib/services/email.service');
const notificationService = require('@/lib/services/notification.service');
const auditService = require('@/lib/services/admin-audit.service');
const service = require('@/lib/services/admin-session-detail.service');

const NOW = new Date('2026-11-23T13:00:00Z');
const OLD = { id: 'tutor-old', name: 'Daniel', email: 'daniel@test.co', phoneNumber: null };
const NEW = { id: 'tutor-new', name: 'Andrés', email: 'andres@test.co' };
const STUDENT = { id: 'student-1', name: 'Alejandro', email: 'alejandro@test.co', phoneNumber: null };

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    status: 'Accepted',
    source: 'Platform',
    sessionType: 'Individual',
    locationType: 'Virtual',
    startTimestamp: new Date('2026-11-23T17:50:00Z'),
    endTimestamp: new Date('2026-11-23T18:50:00Z'),
    createdAt: new Date('2026-11-20T10:00:00Z'),
    notes: null,
    topicsToReview: 'Parcial final',
    googleCalendarEventId: 'event-1',
    googleMeetLink: 'https://meet.google.com/abc',
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    courseId: 'course-1',
    tutorId: OLD.id,
    course: { id: 'course-1', code: 'MATE1102', name: 'Matemática Estructural' },
    tutor: OLD,
    participants: [{ student: STUDENT }],
    attachments: [{ id: 'att-1', s3Key: 'k/1.pdf', fileName: 'programa.pdf', fileSize: 1000, mimeType: 'application/pdf', uploadedAt: NOW }],
    payments: [{ id: 'pay-1', status: 'paid', amount: 50000, tutorPayoutStatus: 'pending', packageId: null, wompiId: 'w-1' }],
    _count: { reviews: 0, studentReviews: 0 },
    ...overrides,
  };
}

const reassign = (extra = {}) => service.reassignTutor({
  sessionId: 'session-1', newTutorId: NEW.id, adminId: 'admin-1', now: NOW, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionRepo.findAdminDetailById.mockResolvedValue(makeSession());
  sessionRepo.findByTutorInRange.mockResolvedValue([]);
  sessionRepo.reassignTutor.mockResolvedValue(true);
  academicRepo.findOfferingTutorsForCourse.mockResolvedValue([OLD, NEW]);
  calendar.replaceTutoringSessionTutor.mockResolvedValue({ success: true });
  emailService.sendSessionConfirmedEmail.mockResolvedValue({});
  notificationService.notifySessionReassigned.mockResolvedValue([]);
  sessionRepo.cancelByAdmin.mockResolvedValue(true);
  calendar.cancelTutoringSessionEvent.mockResolvedValue({ success: true });
  emailService.sendSessionCancellationToStudent.mockResolvedValue({});
  emailService.sendSessionCancellationToTutor.mockResolvedValue({});
  notificationService.notifySessionCancelledByCalico.mockResolvedValue([]);
});

describe('reassignBlocker', () => {
  it.each([
    [{ status: 'Completed' }, 'SESSION_NOT_REASSIGNABLE'],
    [{ status: 'Canceled' }, 'SESSION_NOT_REASSIGNABLE'],
    [{ endTimestamp: new Date('2026-11-23T12:00:00Z') }, 'SESSION_ENDED'],
    [{ payments: [{ tutorPayoutStatus: 'paid', packageId: null }] }, 'TUTOR_ALREADY_PAID'],
    [{ payments: [{ tutorPayoutStatus: 'pending', packageId: 'pkg-1' }] }, 'PACKAGE_SESSION'],
    [{ _count: { reviews: 1, studentReviews: 0 } }, 'SESSION_HAS_REVIEWS'],
  ])('blocks %o with %s', (overrides, code) => {
    expect(service.reassignBlocker(makeSession(overrides), NOW)).toBe(code);
  });

  it('allows a pending-payout session that has not ended, even if it already started', () => {
    const started = makeSession({ startTimestamp: new Date('2026-11-23T12:30:00Z') });
    expect(service.reassignBlocker(started, NOW)).toBeNull();
  });
});

describe('getSessionDetail', () => {
  it('returns the student files with download links and the reassign state', async () => {
    const detail = await service.getSessionDetail('session-1', NOW);
    expect(detail.attachments).toEqual([expect.objectContaining({ fileName: 'programa.pdf', downloadUrl: 'https://s3.test/k/1.pdf' })]);
    expect(detail.attachments[0]).not.toHaveProperty('s3Key');
    expect(detail.reassign).toEqual({ allowed: true, blocker: null });
    expect(detail.cancel).toEqual({ allowed: true, blocker: null });
    expect(detail.payments[0]).toEqual(expect.objectContaining({ amount: 50000, viaWompi: true }));
  });

  it('refuses an unknown session', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(null);
    await expect(service.getSessionDetail('nope')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });
});

describe('listReassignCandidates', () => {
  it('leaves out the current tutor and flags tutors with an overlapping session', async () => {
    const other = { id: 'tutor-busy', name: 'Busy', email: 'b@test.co' };
    academicRepo.findOfferingTutorsForCourse.mockResolvedValue([OLD, NEW, other]);
    sessionRepo.findByTutorInRange.mockImplementation(async (tutorId) => (tutorId === other.id ? [{ id: 'x' }] : []));

    expect(await service.listReassignCandidates('session-1')).toEqual([
      { ...NEW, busy: false },
      { ...other, busy: true },
    ]);
  });
});

describe('reassignTutor', () => {
  it('moves the session, audits, swaps the calendar tutor and tells everyone', async () => {
    const result = await reassign({ reason: 'imprevisto' });

    expect(sessionRepo.reassignTutor).toHaveBeenCalledWith({ sessionId: 'session-1', fromTutorId: OLD.id, toTutorId: NEW.id });
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'SESSION_REASSIGN_TUTOR',
      targetId: 'session-1',
      payload: expect.objectContaining({ reason: 'imprevisto', paymentIds: ['pay-1'] }),
    }));
    expect(calendar.replaceTutoringSessionTutor).toHaveBeenCalledWith('event-1', expect.objectContaining({
      fromEmail: OLD.email, toEmail: NEW.email, toName: NEW.name,
    }));
    expect(emailService.sendSessionConfirmedEmail.mock.calls.map(([to]) => to)).toEqual([NEW.email, STUDENT.email]);
    expect(notificationService.notifySessionReassigned).toHaveBeenCalledWith(expect.objectContaining({
      fromTutorId: OLD.id, toTutor: NEW, studentName: STUDENT.name,
    }));
    expect(result).toEqual(expect.objectContaining({ calendar: 'updated', emailsSent: 2, emailsFailed: 0 }));
  });

  it.each([
    ['the current tutor', OLD.id, 'SAME_TUTOR'],
    ['a student of the session', STUDENT.id, 'SELF_BOOKING'],
    ['a tutor not offering the course', 'tutor-other', 'TUTOR_NOT_OFFERING'],
  ])('refuses %s without writing', async (_label, newTutorId, code) => {
    await expect(reassign({ newTutorId })).rejects.toMatchObject({ code });
    expect(sessionRepo.reassignTutor).not.toHaveBeenCalled();
  });

  it('refuses a tutor with an overlapping session', async () => {
    sessionRepo.findByTutorInRange.mockResolvedValue([{ id: 'other-session' }]);
    await expect(reassign()).rejects.toMatchObject({ code: 'SESSION_CONFLICT' });
    expect(sessionRepo.reassignTutor).not.toHaveBeenCalled();
  });

  it('ignores the session itself when checking overlaps', async () => {
    sessionRepo.findByTutorInRange.mockResolvedValue([{ id: 'session-1' }]);
    await expect(reassign()).resolves.toEqual(expect.objectContaining({ calendar: 'updated' }));
  });

  it('refuses a blocked session without writing', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(makeSession({ payments: [{ tutorPayoutStatus: 'paid', packageId: null }] }));
    await expect(reassign()).rejects.toMatchObject({ code: 'TUTOR_ALREADY_PAID' });
    expect(sessionRepo.reassignTutor).not.toHaveBeenCalled();
  });

  it('reports SESSION_CHANGED when the guarded write finds a different state', async () => {
    sessionRepo.reassignTutor.mockResolvedValue(false);
    await expect(reassign()).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(auditService.logAction).not.toHaveBeenCalled();
    expect(calendar.replaceTutoringSessionTutor).not.toHaveBeenCalled();
  });

  it('keeps the move when the calendar and an email fail, and says so', async () => {
    calendar.replaceTutoringSessionTutor.mockRejectedValue(Object.assign(new Error('x'), { code: 'CALENDAR_PERMISSION_DENIED' }));
    emailService.sendSessionConfirmedEmail.mockRejectedValueOnce(new Error('brevo down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await reassign();

    expect(result).toEqual(expect.objectContaining({ calendar: 'failed', emailsSent: 1, emailsFailed: 1 }));
    expect(notificationService.notifySessionReassigned).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports calendar none when the session has no event', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(makeSession({ googleCalendarEventId: null }));
    const result = await reassign();
    expect(result.calendar).toBe('none');
    expect(calendar.replaceTutoringSessionTutor).not.toHaveBeenCalled();
  });
});

describe('cancelBlocker', () => {
  it.each([
    [{ status: 'Completed' }, 'SESSION_NOT_CANCELABLE'],
    [{ status: 'Canceled' }, 'SESSION_NOT_CANCELABLE'],
    [{ status: 'Rejected' }, 'SESSION_NOT_CANCELABLE'],
    [{ payments: [{ tutorPayoutStatus: 'paid', packageId: null }] }, 'TUTOR_ALREADY_PAID'],
  ])('blocks %o with %s', (overrides, code) => {
    expect(service.cancelBlocker(makeSession(overrides))).toBe(code);
  });

  it('allows a pending session and one that already ended (no 6-hour limit)', () => {
    expect(service.cancelBlocker(makeSession({ status: 'Pending' }))).toBeNull();
    expect(service.cancelBlocker(makeSession({ endTimestamp: new Date('2026-11-23T12:00:00Z') }))).toBeNull();
  });
});

describe('cancelSession', () => {
  const cancel = (extra = {}) => service.cancelSession({
    sessionId: 'session-1', reason: 'El tutor no llegó', adminId: 'admin-1', now: NOW, ...extra,
  });

  it('cancels, audits, deletes the calendar event and tells tutor and students', async () => {
    const result = await cancel();

    expect(sessionRepo.cancelByAdmin).toHaveBeenCalledWith({
      sessionId: 'session-1', adminId: 'admin-1', reason: 'El tutor no llegó', now: NOW,
    });
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'SESSION_CANCEL',
      targetId: 'session-1',
      payload: expect.objectContaining({ previousStatus: 'Accepted', reason: 'El tutor no llegó', paymentIds: ['pay-1'] }),
    }));
    expect(calendar.cancelTutoringSessionEvent).toHaveBeenCalledWith('event-1');
    expect(emailService.sendSessionCancellationToStudent).toHaveBeenCalledWith(
      STUDENT.email, STUDENT.name, expect.objectContaining({ id: 'session-1' }), 'El tutor no llegó', null, null,
    );
    expect(emailService.sendSessionCancellationToTutor).toHaveBeenCalledWith(
      OLD.email, OLD.name, expect.objectContaining({ id: 'session-1' }), 'El tutor no llegó',
    );
    expect(notificationService.notifySessionCancelledByCalico).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }), { includeTutor: true },
    );
    expect(result).toEqual(expect.objectContaining({
      calendar: 'deleted', emailsSent: 2, emailsFailed: 0, refundPending: true,
    }));
  });

  it('does not flag a refund for an unpaid session', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(makeSession({
      status: 'Pending',
      payments: [{ id: 'pay-1', status: 'pending', amount: 50000, tutorPayoutStatus: 'pending', packageId: null }],
    }));
    expect((await cancel()).refundPending).toBe(false);
  });

  it('refuses a blocked session without writing', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(makeSession({ status: 'Completed' }));
    await expect(cancel()).rejects.toMatchObject({ code: 'SESSION_NOT_CANCELABLE' });
    expect(sessionRepo.cancelByAdmin).not.toHaveBeenCalled();
  });

  it('reports SESSION_CHANGED when the guarded write finds a different state', async () => {
    sessionRepo.cancelByAdmin.mockResolvedValue(false);
    await expect(cancel()).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(auditService.logAction).not.toHaveBeenCalled();
    expect(calendar.cancelTutoringSessionEvent).not.toHaveBeenCalled();
  });

  it('keeps the cancellation when the calendar and an email fail, and says so', async () => {
    calendar.cancelTutoringSessionEvent.mockRejectedValue(new Error('x'));
    emailService.sendSessionCancellationToTutor.mockRejectedValue(new Error('brevo down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await cancel();

    expect(result).toEqual(expect.objectContaining({ calendar: 'failed', emailsSent: 1, emailsFailed: 1 }));
    expect(notificationService.notifySessionCancelledByCalico).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports calendar none when the session has no event', async () => {
    sessionRepo.findAdminDetailById.mockResolvedValue(makeSession({ googleCalendarEventId: null }));
    expect((await cancel()).calendar).toBe('none');
    expect(calendar.cancelTutoringSessionEvent).not.toHaveBeenCalled();
  });
});

describe('cancelFutureSessionsOfTutor', () => {
  const run = () => service.cancelFutureSessionsOfTutor({
    tutorId: OLD.id, reason: 'Tu tutor ya no está', adminId: 'admin-1', trigger: 'TUTOR_SUSPENDED', now: NOW,
  });

  it('cancels each upcoming session without emailing or notifying the tutor', async () => {
    sessionRepo.findUpcomingActiveIdsByTutor.mockResolvedValue(['session-1', 'session-2']);

    const summary = await run();

    expect(sessionRepo.findUpcomingActiveIdsByTutor).toHaveBeenCalledWith(OLD.id, NOW);
    expect(sessionRepo.cancelByAdmin).toHaveBeenCalledTimes(2);
    expect(emailService.sendSessionCancellationToStudent).toHaveBeenCalledTimes(2);
    expect(emailService.sendSessionCancellationToTutor).not.toHaveBeenCalled();
    expect(notificationService.notifySessionCancelledByCalico).toHaveBeenCalledWith(expect.anything(), { includeTutor: false });
    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SESSION_CANCEL',
      payload: expect.objectContaining({ trigger: 'TUTOR_SUSPENDED' }),
    }));
    expect(summary).toEqual({ canceled: 2, skipped: 0, failed: 0, calendarFailed: 0, emailsFailed: 0, refundsPending: 2 });
  });

  it('skips sessions it may not cancel and counts unexpected errors, without throwing', async () => {
    sessionRepo.findUpcomingActiveIdsByTutor.mockResolvedValue(['paid-out', 'boom', 'ok']);
    sessionRepo.findAdminDetailById.mockImplementation(async (id) => {
      if (id === 'paid-out') return makeSession({ id, payments: [{ id: 'p', status: 'paid', amount: 1, tutorPayoutStatus: 'paid' }] });
      if (id === 'boom') throw new Error('db down');
      return makeSession({ id, googleCalendarEventId: null, payments: [] });
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const summary = await run();

    expect(summary).toEqual({ canceled: 1, skipped: 1, failed: 1, calendarFailed: 0, emailsFailed: 0, refundsPending: 0 });
    spy.mockRestore();
  });

  it('does nothing when the tutor has no upcoming sessions', async () => {
    sessionRepo.findUpcomingActiveIdsByTutor.mockResolvedValue([]);
    expect((await run()).canceled).toBe(0);
    expect(sessionRepo.cancelByAdmin).not.toHaveBeenCalled();
  });
});
