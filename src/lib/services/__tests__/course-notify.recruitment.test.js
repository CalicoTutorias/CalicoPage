/**
 * @jest-environment node
 *
 * course-notify.service.getRecruitmentDemand — tablero de reclutamiento.
 */

jest.mock('@/lib/repositories/course-notify.repository', () => ({ findOpenDemandByCourse: jest.fn() }));
jest.mock('@/lib/repositories/academic.repository', () => ({}));
jest.mock('@/lib/repositories/user.repository', () => ({}));
jest.mock('@/lib/services/email.service', () => ({ sendCourseAvailableNotificationEmail: jest.fn() }));
jest.mock('@/lib/services/tutor-listing.service', () => ({
  countListedTutorsForCourse: jest.fn(),
  countListedTutorsForCourses: jest.fn(),
}));

const repo = require('@/lib/repositories/course-notify.repository');
const listing = require('@/lib/services/tutor-listing.service');
const { getRecruitmentDemand } = require('@/lib/services/course-notify.service');

const row = (over) => ({
  courseId: 'c', courseCode: 'X', courseName: 'X', waiting: 1, oldestAt: new Date('2026-11-01'),
  approvedTutors: 0, pendingRequests: 0, ...over,
});

it('puts courses nobody offers first, then by students waiting, then by oldest wait', async () => {
  repo.findOpenDemandByCourse.mockResolvedValue([
    row({ courseId: 'covered', waiting: 9 }),
    row({ courseId: 'few', waiting: 2 }),
    row({ courseId: 'many', waiting: 6, approvedTutors: 1 }),
    row({ courseId: 'few-older', waiting: 2, oldestAt: new Date('2026-10-01') }),
  ]);
  listing.countListedTutorsForCourses.mockResolvedValue(new Map([['covered', 1]]));

  const demand = await getRecruitmentDemand();

  expect(demand.map((d) => d.courseId)).toEqual(['many', 'few-older', 'few', 'covered']);
  expect(demand.find((d) => d.courseId === 'covered')).toMatchObject({ listedTutors: 1, needsTutor: false });
  // Aprobado pero sin disponibilidad: sigue sin tutor visible.
  expect(demand.find((d) => d.courseId === 'many')).toMatchObject({ approvedTutors: 1, listedTutors: 0, needsTutor: true });
  expect(listing.countListedTutorsForCourses).toHaveBeenCalledWith(['covered', 'few', 'many', 'few-older']);
});
