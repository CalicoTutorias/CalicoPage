/**
 * @jest-environment node
 *
 * admin.service.suspendTutor — suspending a tutor cancels their upcoming
 * sessions through the admin cancellation (calendar, student emails, refunds),
 * never returns the password hash, and still suspends if the cancellation breaks.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { TUTOR_SUSPEND: 'TUTOR_SUSPEND', TUTOR_REINSTATE: 'TUTOR_REINSTATE' },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));
jest.mock('@/lib/services/admin-session-detail.service', () => ({ cancelFutureSessionsOfTutor: jest.fn() }));
jest.mock('@/lib/services/email.service', () => ({ sendTutorSuspended: jest.fn(async () => ({})) }));
jest.mock('@/lib/services/tutor-availability-status.service', () => ({}));
jest.mock('@/lib/services/notification.service', () => ({}));
jest.mock('@/lib/services/course-notify.service', () => ({ notifyPendingSubscribersForCourse: jest.fn() }));

const prisma = require('@/lib/prisma').default;
const auditService = require('@/lib/services/admin-audit.service');
const { cancelFutureSessionsOfTutor } = require('@/lib/services/admin-session-detail.service');
const { sendTutorSuspended } = require('@/lib/services/email.service');
const { suspendTutor, reinstateTutor } = require('@/lib/services/admin.service');

const TUTOR = { id: 'tutor-1', name: 'Daniel', email: 'daniel@test.co' };
const SUMMARY = { canceled: 2, skipped: 1, failed: 0, calendarFailed: 0, emailsFailed: 0, refundsPending: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: TUTOR.id, isActive: true, isTutorApproved: true, suspendedAt: null });
  prisma.user.update.mockResolvedValue({ ...TUTOR, isActive: false });
  cancelFutureSessionsOfTutor.mockResolvedValue(SUMMARY);
});

const suspend = () => suspendTutor({ userId: TUTOR.id, adminId: 'admin-1', reason: 'No se presentó' });

it('cancels the upcoming sessions on the students\' behalf and reports the summary', async () => {
  const result = await suspend();

  expect(cancelFutureSessionsOfTutor).toHaveBeenCalledWith(expect.objectContaining({
    tutorId: TUTOR.id, adminId: 'admin-1', trigger: 'TUTOR_SUSPENDED', reason: expect.stringMatching(/ya no está disponible/),
  }));
  // The admin's private suspension reason is not what students read.
  expect(cancelFutureSessionsOfTutor.mock.calls[0][0].reason).not.toMatch(/No se presentó/);
  expect(result).toEqual(expect.objectContaining({ cancelledSessionsCount: 2, sessionCancellation: SUMMARY }));
  expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'TUTOR_SUSPEND',
    payload: expect.objectContaining({ cancelledSessionsCount: 2, sessionCancellation: SUMMARY }),
  }));
  expect(sendTutorSuspended).toHaveBeenCalledWith({ email: TUTOR.email, name: TUTOR.name }, 'No se presentó');
});

it('asks the DB only for safe user fields', async () => {
  await suspend();
  const { select } = prisma.user.update.mock.calls[0][0];
  expect(select).toBeDefined();
  expect(select).not.toHaveProperty('passwordHash');
});

it('keeps the suspension when cancelling the sessions blows up', async () => {
  cancelFutureSessionsOfTutor.mockRejectedValue(new Error('db down'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const result = await suspend();

  expect(prisma.user.update).toHaveBeenCalled();
  expect(result.cancelledSessionsCount).toBe(0);
  expect(result.sessionCancellation.incomplete).toBe(true);
  spy.mockRestore();
});

it('does not cancel anything for an already suspended tutor', async () => {
  prisma.user.findUnique.mockResolvedValue({ id: TUTOR.id, isActive: false, isTutorApproved: true });
  await expect(suspend()).rejects.toMatchObject({ code: 'ALREADY_SUSPENDED' });
  expect(cancelFutureSessionsOfTutor).not.toHaveBeenCalled();
});

it('reinstating also returns only safe user fields', async () => {
  prisma.user.findUnique.mockResolvedValue({ id: TUTOR.id, isActive: false, suspendedAt: new Date() });
  await reinstateTutor({ userId: TUTOR.id, adminId: 'admin-1' });
  expect(prisma.user.update.mock.calls[0][0].select).not.toHaveProperty('passwordHash');
});
