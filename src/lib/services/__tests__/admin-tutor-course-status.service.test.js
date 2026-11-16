/**
 * @jest-environment node
 *
 * admin.service.setTutorCourseStatus — aprobar/rechazar una materia de un
 * tutor desde admin: audita y, si el estado cambió, avisa al tutor y (al
 * aprobar) a los estudiantes de «Avísame».
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    tutorCourse: { findUnique: jest.fn(), update: jest.fn() },
    course: { findUnique: jest.fn() },
  },
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { COURSE_APPROVE: 'COURSE_APPROVE', COURSE_REJECT: 'COURSE_REJECT' },
  logAction: jest.fn(),
}));
jest.mock('@/lib/services/admin-metrics.service', () => ({ invalidateAllMetrics: jest.fn() }));
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
  notifyCourseApproved: jest.fn(),
  notifyCourseRejected: jest.fn(),
}));
jest.mock('@/lib/services/course-notify.service', () => ({ notifyPendingSubscribersForCourse: jest.fn() }));

const prisma = require('@/lib/prisma').default;
const auditService = require('@/lib/services/admin-audit.service');
const notificationService = require('@/lib/services/notification.service');
const courseNotify = require('@/lib/services/course-notify.service');
const adminService = require('@/lib/services/admin.service');

const call = (status) => adminService.setTutorCourseStatus({
  userId: 'tutor-1', courseId: 'course-1', adminId: 'admin-1', status,
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.tutorCourse.update.mockImplementation(({ data }) => Promise.resolve({ tutorId: 'tutor-1', courseId: 'course-1', ...data }));
  prisma.course.findUnique.mockResolvedValue({ name: 'Cálculo' });
});

it('on approval audits, notifies «Avísame» subscribers and the tutor', async () => {
  prisma.tutorCourse.findUnique.mockResolvedValue({ status: 'Pending' });
  await call('Approved');

  expect(auditService.logAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'COURSE_APPROVE' }));
  expect(courseNotify.notifyPendingSubscribersForCourse).toHaveBeenCalledWith('course-1');
  expect(notificationService.notifyCourseApproved).toHaveBeenCalledWith('tutor-1', 'Cálculo');
});

it('on rejection notifies the tutor but not the subscribers', async () => {
  prisma.tutorCourse.findUnique.mockResolvedValue({ status: 'Pending' });
  await call('Rejected');

  expect(courseNotify.notifyPendingSubscribersForCourse).not.toHaveBeenCalled();
  expect(notificationService.notifyCourseRejected).toHaveBeenCalledWith('tutor-1', 'Cálculo');
});

it('does not notify again when the status did not change', async () => {
  prisma.tutorCourse.findUnique.mockResolvedValue({ status: 'Approved' });
  await call('Approved');

  expect(courseNotify.notifyPendingSubscribersForCourse).not.toHaveBeenCalled();
  expect(notificationService.notifyCourseApproved).not.toHaveBeenCalled();
});

it('never fails the admin action when a notification fails', async () => {
  prisma.tutorCourse.findUnique.mockResolvedValue({ status: 'Pending' });
  courseNotify.notifyPendingSubscribersForCourse.mockRejectedValue(new Error('brevo down'));
  notificationService.notifyCourseApproved.mockRejectedValue(new Error('db'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  await expect(call('Approved')).resolves.toMatchObject({ status: 'Approved' });
});
