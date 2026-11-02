/**
 * @jest-environment node
 *
 * Unit tests for pausing and resuming a course (academic.service): only an
 * approved course can be paused, only a paused one can be resumed (a tutor can
 * never approve themselves), repeats are harmless, and resuming wakes up the
 * students waiting on that course. The real query runs in
 * src/__integration__/tutor-course-offering.int.test.js.
 */

jest.mock('@/lib/repositories/academic.repository', () => ({
  moveTutorCourseStatus: jest.fn(),
  findTutorCourse: jest.fn(),
}));
jest.mock('@/lib/repositories/user.repository', () => ({}));
jest.mock('@/lib/services/notification.service', () => ({}));
jest.mock('@/lib/services/course-notify.service', () => ({ notifyPendingSubscribersForCourse: jest.fn() }));
jest.mock('@/lib/services/email.service', () => ({ sendCourseRequestNotification: jest.fn() }));
jest.mock('@/lib/services/tutor-listing.service', () => ({}));

const repo = require('@/lib/repositories/academic.repository');
const courseNotify = require('@/lib/services/course-notify.service');
const service = require('@/lib/services/academic.service');

const TUTOR = 'tutor-1';
const COURSE = 'course-1';
const row = (status) => ({ tutorId: TUTOR, courseId: COURSE, status });

beforeEach(() => {
  jest.clearAllMocks();
  courseNotify.notifyPendingSubscribersForCourse.mockResolvedValue();
});

describe('pauseTutorCourse', () => {
  it('moves it from Approved to Paused and gives back the row', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(true);
    repo.findTutorCourse.mockResolvedValue(row('Paused'));

    await expect(service.pauseTutorCourse(TUTOR, COURSE)).resolves.toEqual(row('Paused'));

    expect(repo.moveTutorCourseStatus).toHaveBeenCalledWith(TUTOR, COURSE, 'Approved', 'Paused');
  });

  it('pausing twice is harmless', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(false);
    repo.findTutorCourse.mockResolvedValue(row('Paused'));
    await expect(service.pauseTutorCourse(TUTOR, COURSE)).resolves.toEqual(row('Paused'));
  });

  it.each(['Pending', 'Rejected'])('a %s course cannot be paused', async (status) => {
    repo.moveTutorCourseStatus.mockResolvedValue(false);
    repo.findTutorCourse.mockResolvedValue(row(status));
    await expect(service.pauseTutorCourse(TUTOR, COURSE)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('a course outside the catalog is NOT_FOUND', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(false);
    repo.findTutorCourse.mockResolvedValue(null);
    await expect(service.pauseTutorCourse(TUTOR, COURSE)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('resumeTutorCourse', () => {
  it('moves it from Paused to Approved and tells the students waiting for the course', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(true);
    repo.findTutorCourse.mockResolvedValue(row('Approved'));

    await expect(service.resumeTutorCourse(TUTOR, COURSE)).resolves.toEqual(row('Approved'));

    expect(repo.moveTutorCourseStatus).toHaveBeenCalledWith(TUTOR, COURSE, 'Paused', 'Approved');
    expect(courseNotify.notifyPendingSubscribersForCourse).toHaveBeenCalledWith(COURSE);
  });

  it('a failed notification does not undo the resume', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(true);
    repo.findTutorCourse.mockResolvedValue(row('Approved'));
    courseNotify.notifyPendingSubscribersForCourse.mockRejectedValue(new Error('Brevo down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.resumeTutorCourse(TUTOR, COURSE)).resolves.toEqual(row('Approved'));
    console.error.mockRestore();
  });

  it('resuming twice is harmless and notifies nobody the second time', async () => {
    repo.moveTutorCourseStatus.mockResolvedValue(false);
    repo.findTutorCourse.mockResolvedValue(row('Approved'));

    await expect(service.resumeTutorCourse(TUTOR, COURSE)).resolves.toEqual(row('Approved'));

    expect(courseNotify.notifyPendingSubscribersForCourse).not.toHaveBeenCalled();
  });

  it.each(['Pending', 'Rejected'])('a tutor cannot approve themselves by resuming a %s course', async (status) => {
    repo.moveTutorCourseStatus.mockResolvedValue(false);
    repo.findTutorCourse.mockResolvedValue(row(status));

    await expect(service.resumeTutorCourse(TUTOR, COURSE)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    expect(repo.moveTutorCourseStatus).toHaveBeenCalledWith(TUTOR, COURSE, 'Paused', 'Approved');
    expect(courseNotify.notifyPendingSubscribersForCourse).not.toHaveBeenCalled();
  });
});
