/**
 * Unit tests for academic.service.js — course approval/rejection functions
 * Mocks the academic repository and notification service.
 */

// Mock prisma first before importing anything that uses it
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('@/lib/repositories/academic.repository', () => ({
  findAllDepartments: jest.fn(),
  findDepartmentById: jest.fn(),
  findAllCareers: jest.fn(),
  findCareerById: jest.fn(),
  findCareerByCode: jest.fn(),
  findAllCourses: jest.fn(),
  findCourseById: jest.fn(),
  findCourseByCode: jest.fn(),
  createCourse: jest.fn(),
  updateCourse: jest.fn(),
  deleteCourse: jest.fn(),
  findTopicsByCourse: jest.fn(),
  findTopicById: jest.fn(),
  createTopic: jest.fn(),
  updateTopic: jest.fn(),
  deleteTopic: jest.fn(),
  findTutorCourses: jest.fn(),
  findTutorCoursesByStatus: jest.fn(),
  findTutorsForCourse: jest.fn(),
  addTutorCourses: jest.fn(),
  addTutorCourse: jest.fn(),
  updateTutorCourseStatus: jest.fn(),
  removeTutorCourse: jest.fn(),
  findAllPendingCourseRequests: jest.fn(),
  findAllCoursePrices: jest.fn(),
  findCoursePrice: jest.fn(),
  upsertCoursePrice: jest.fn(),
}));

jest.mock('@/lib/repositories/user.repository', () => ({
  findById: jest.fn(),
}));

jest.mock('@/lib/services/notification.service', () => ({
  notifyCourseApproved: jest.fn(),
  notifyCourseRejected: jest.fn(),
}));

jest.mock('@/lib/services/email.service', () => ({
  sendCourseRequestNotification: jest.fn(),
}));

const academicRepo = require('@/lib/repositories/academic.repository');
const notificationService = require('@/lib/services/notification.service');
const academicService = require('@/lib/services/academic.service');

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── approveTutorCourse ──────────────────────────────────────────────

describe('approveTutorCourse', () => {
  it('updates course status to Approved and notifies tutor', async () => {
    const updatedTutorCourse = {
      tutorId: 'tutor-123',
      courseId: 'course-456',
      status: 'Approved',
    };
    const course = {
      id: 'course-456',
      name: 'Cálculo I',
    };

    academicRepo.updateTutorCourseStatus.mockResolvedValue(updatedTutorCourse);
    academicRepo.findCourseById.mockResolvedValue(course);
    notificationService.notifyCourseApproved.mockResolvedValue({ id: 'notif-1' });

    const result = await academicService.approveTutorCourse('tutor-123', 'course-456');

    expect(academicRepo.updateTutorCourseStatus).toHaveBeenCalledWith(
      'tutor-123',
      'course-456',
      'Approved',
    );
    expect(academicRepo.findCourseById).toHaveBeenCalledWith('course-456');
    expect(notificationService.notifyCourseApproved).toHaveBeenCalledWith('tutor-123', 'Cálculo I');
    expect(result.status).toBe('Approved');
  });

  it('handles missing course gracefully', async () => {
    const updatedTutorCourse = {
      tutorId: 'tutor-123',
      courseId: 'course-456',
      status: 'Approved',
    };

    academicRepo.updateTutorCourseStatus.mockResolvedValue(updatedTutorCourse);
    academicRepo.findCourseById.mockResolvedValue(null);
    notificationService.notifyCourseApproved.mockResolvedValue({ id: 'notif-1' });

    const result = await academicService.approveTutorCourse('tutor-123', 'course-456');

    expect(result.status).toBe('Approved');
    expect(notificationService.notifyCourseApproved).not.toHaveBeenCalled();
  });
});

// ─── rejectTutorCourse ──────────────────────────────────────────────

describe('rejectTutorCourse', () => {
  it('updates course status to Rejected and notifies tutor', async () => {
    const updatedTutorCourse = {
      tutorId: 'tutor-789',
      courseId: 'course-999',
      status: 'Rejected',
    };
    const course = {
      id: 'course-999',
      name: 'Física II',
    };

    academicRepo.updateTutorCourseStatus.mockResolvedValue(updatedTutorCourse);
    academicRepo.findCourseById.mockResolvedValue(course);
    notificationService.notifyCourseRejected.mockResolvedValue({ id: 'notif-2' });

    const result = await academicService.rejectTutorCourse('tutor-789', 'course-999');

    expect(academicRepo.updateTutorCourseStatus).toHaveBeenCalledWith(
      'tutor-789',
      'course-999',
      'Rejected',
    );
    expect(academicRepo.findCourseById).toHaveBeenCalledWith('course-999');
    expect(notificationService.notifyCourseRejected).toHaveBeenCalledWith('tutor-789', 'Física II');
    expect(result.status).toBe('Rejected');
  });

  it('handles missing course gracefully', async () => {
    const updatedTutorCourse = {
      tutorId: 'tutor-789',
      courseId: 'course-999',
      status: 'Rejected',
    };

    academicRepo.updateTutorCourseStatus.mockResolvedValue(updatedTutorCourse);
    academicRepo.findCourseById.mockResolvedValue(null);
    notificationService.notifyCourseRejected.mockResolvedValue({ id: 'notif-2' });

    const result = await academicService.rejectTutorCourse('tutor-789', 'course-999');

    expect(result.status).toBe('Rejected');
    expect(notificationService.notifyCourseRejected).not.toHaveBeenCalled();
  });
});
