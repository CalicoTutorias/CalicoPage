/**
 * @jest-environment node
 *
 * admin.service.sendAvailabilityReminders — recordatorio "pon tu horario".
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { TUTOR_AVAILABILITY_REMINDER: 'TUTOR_AVAILABILITY_REMINDER' },
  logAction: jest.fn(),
}));

jest.mock('@/lib/services/admin-metrics.service', () => ({
  invalidateAllMetrics: jest.fn(),
}));

jest.mock('@/lib/services/email.service', () => ({
  sendTutorApplicationApproved: jest.fn(),
  sendTutorApplicationRejected: jest.fn(),
  sendTutorSuspended: jest.fn(),
  sendTutorAvailabilityReminder: jest.fn(),
  isTutorAvailabilityReminderConfigured: jest.fn(),
}));

jest.mock('@/lib/services/tutor-availability-status.service', () => ({
  getAvailabilityStatusForTutor: jest.fn(),
  getAvailabilityStatusForTutors: jest.fn(),
}));

jest.mock('@/lib/services/notification.service', () => ({
  notifyAvailabilityReminder: jest.fn(),
  getLastAvailabilityReminderAt: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const auditService = require('@/lib/services/admin-audit.service');
const emailService = require('@/lib/services/email.service');
const statusService = require('@/lib/services/tutor-availability-status.service');
const notificationService = require('@/lib/services/notification.service');
const adminService = require('@/lib/services/admin.service');

const T1 = { id: 't1', email: 't1@uniandes.edu.co', name: 'Tutor Uno', isTutorApproved: true, isActive: true };
const T2 = { id: 't2', email: 't2@uniandes.edu.co', name: 'Tutor Dos', isTutorApproved: true, isActive: true };
const T3 = { id: 't3', email: 't3@uniandes.edu.co', name: 'Tutor Tres', isTutorApproved: true, isActive: true };

const HIDDEN = { status: 'low', isListed: false, hours: 1.5, minListingHours: 3, thresholdHours: 10, windowDays: 7 };
const LISTED = { status: 'ok', isListed: true, hours: 12, minListingHours: 3, thresholdHours: 10, windowDays: 7 };

beforeEach(() => {
  jest.clearAllMocks();
  emailService.isTutorAvailabilityReminderConfigured.mockReturnValue(true);
  emailService.sendTutorAvailabilityReminder.mockResolvedValue({ success: true });
  notificationService.notifyAvailabilityReminder.mockResolvedValue({ id: 'n1' });
  notificationService.getLastAvailabilityReminderAt.mockResolvedValue(new Map());
});

describe('sendAvailabilityReminders', () => {
  it('throws EMAIL_TEMPLATE_NOT_CONFIGURED before touching the DB when the template id is missing', async () => {
    emailService.isTutorAvailabilityReminderConfigured.mockReturnValue(false);

    await expect(
      adminService.sendAvailabilityReminders({ adminId: 'admin-1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TEMPLATE_NOT_CONFIGURED' });

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('emails only hidden tutors, creates the in-app notification after the email, and audits the batch', async () => {
    prisma.user.findMany.mockResolvedValue([T1, T2]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['t1', HIDDEN], ['t2', LISTED]]),
    );

    const result = await adminService.sendAvailabilityReminders({ adminId: 'admin-1' });

    // Bulk mode queries active approved tutors only.
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isTutorApproved: true, isActive: true },
    }));

    expect(emailService.sendTutorAvailabilityReminder).toHaveBeenCalledTimes(1);
    expect(emailService.sendTutorAvailabilityReminder).toHaveBeenCalledWith(
      { email: T1.email, name: T1.name },
      { thresholdHours: 10, windowDays: 7, freeHours: 1.5, minListingHours: 3 },
    );
    expect(notificationService.notifyAvailabilityReminder).toHaveBeenCalledWith('t1', { sentById: 'admin-1', email: T1.email });

    expect(result.sent).toEqual([{ userId: 't1', email: T1.email }]);
    expect(result.skipped).toEqual([{ userId: 't2', email: T2.email, reason: 'ALREADY_LISTED' }]);
    expect(result.failed).toEqual([]);

    expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'TUTOR_AVAILABILITY_REMINDER',
      targetType: 'User',
      targetId: 't1',
      payload: expect.objectContaining({ mode: 'all_hidden', sentUserIds: ['t1'], failedUserIds: [] }),
    }));
  });

  it('skips tutors reminded inside the cooldown window in bulk mode', async () => {
    prisma.user.findMany.mockResolvedValue([T1, T3]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['t1', HIDDEN], ['t3', HIDDEN]]),
    );
    notificationService.getLastAvailabilityReminderAt.mockResolvedValue(
      new Map([['t1', new Date(Date.now() - 60 * 60 * 1000)]]), // hace 1 h
    );

    const result = await adminService.sendAvailabilityReminders({ adminId: 'admin-1' });

    expect(result.sent.map((s) => s.userId)).toEqual(['t3']);
    expect(result.skipped).toEqual([
      expect.objectContaining({ userId: 't1', reason: 'RECENTLY_REMINDED' }),
    ]);
  });

  it('ignores the cooldown when skipRecentlyReminded is false (single send from the detail page)', async () => {
    prisma.user.findMany.mockResolvedValue([T1]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(new Map([['t1', HIDDEN]]));

    const result = await adminService.sendAvailabilityReminders({
      userIds: ['t1'],
      adminId: 'admin-1',
      skipRecentlyReminded: false,
    });

    expect(notificationService.getLastAvailabilityReminderAt).not.toHaveBeenCalled();
    expect(result.sent).toHaveLength(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['t1'] } },
    }));
  });

  it('reports unknown ids and non-active tutors as skipped instead of failing the batch', async () => {
    prisma.user.findMany.mockResolvedValue([
      { ...T1, isActive: false },
    ]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(new Map());

    const result = await adminService.sendAvailabilityReminders({
      userIds: ['t1', 'ghost'],
      adminId: 'admin-1',
    });

    expect(result.sent).toEqual([]);
    expect(result.skipped).toEqual(expect.arrayContaining([
      { userId: 'ghost', reason: 'NOT_FOUND' },
      expect.objectContaining({ userId: 't1', reason: 'NOT_ACTIVE_TUTOR' }),
    ]));
    expect(emailService.sendTutorAvailabilityReminder).not.toHaveBeenCalled();
    expect(auditService.logAction).not.toHaveBeenCalled();
  });

  it('isolates Brevo failures per tutor and does not create a notification for a bounced email', async () => {
    prisma.user.findMany.mockResolvedValue([T1, T3]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['t1', HIDDEN], ['t3', HIDDEN]]),
    );
    emailService.sendTutorAvailabilityReminder
      .mockRejectedValueOnce(new Error('Brevo 400'))
      .mockResolvedValueOnce({ success: true });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await adminService.sendAvailabilityReminders({ adminId: 'admin-1' });
    consoleSpy.mockRestore();

    expect(result.failed).toEqual([{ userId: 't1', email: T1.email, reason: 'SEND_FAILED' }]);
    expect(result.sent).toEqual([{ userId: 't3', email: T3.email }]);
    expect(notificationService.notifyAvailabilityReminder).toHaveBeenCalledTimes(1);
    expect(notificationService.notifyAvailabilityReminder).toHaveBeenCalledWith('t3', { sentById: 'admin-1', email: T3.email });
  });
});
