/**
 * @jest-environment node
 *
 * tutor-listing.service — paso 2 de la visibilidad para estudiantes.
 */

jest.mock('@/lib/services/tutor-availability-status.service', () => ({
  getAvailabilityStatusForTutors: jest.fn(),
}));

jest.mock('@/lib/repositories/course-notify.repository', () => ({
  findListingCandidatesForCourses: jest.fn(),
}));

const statusService = require('@/lib/services/tutor-availability-status.service');
const notifyRepo = require('@/lib/repositories/course-notify.repository');
const listing = require('@/lib/services/tutor-listing.service');

const LISTED = { isListed: true, hours: 5 };
const HIDDEN = { isListed: false, hours: 1 };

beforeEach(() => jest.clearAllMocks());

describe('getListedTutorIds', () => {
  it('returns only tutors whose status says isListed, without querying for an empty input', async () => {
    expect((await listing.getListedTutorIds([])).size).toBe(0);
    expect(statusService.getAvailabilityStatusForTutors).not.toHaveBeenCalled();

    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['a', LISTED], ['b', HIDDEN]]),
    );
    const ids = await listing.getListedTutorIds(['a', 'b', 'c', 'a']);
    expect([...ids]).toEqual(['a']);
    // De-duplicated before hitting the status service.
    expect(statusService.getAvailabilityStatusForTutors).toHaveBeenCalledWith(['a', 'b', 'c']);
  });
});

describe('filterListedTutors', () => {
  it('keeps order, drops hidden tutors and applies the limit AFTER filtering', async () => {
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['t1', HIDDEN], ['t2', LISTED], ['t3', LISTED], ['t4', LISTED]]),
    );
    const tutors = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];

    const result = await listing.filterListedTutors(tutors, { limit: 2 });
    expect(result.map((t) => t.id)).toEqual(['t2', 't3']);
  });

  it('supports a custom id getter', async () => {
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(new Map([['u9', LISTED]]));
    const result = await listing.filterListedTutors([{ uid: 'u9' }], { getId: (t) => t.uid });
    expect(result).toHaveLength(1);
  });
});

describe('countListedTutorsForCourses', () => {
  it('counts visible tutors per course from the candidate pairs, in one status batch', async () => {
    notifyRepo.findListingCandidatesForCourses.mockResolvedValue([
      { courseId: 'c1', tutorId: 't1' },
      { courseId: 'c1', tutorId: 't2' },
      { courseId: 'c2', tutorId: 't2' },
      { courseId: 'c3', tutorId: 't3' },
    ]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(
      new Map([['t1', HIDDEN], ['t2', LISTED], ['t3', HIDDEN]]),
    );

    const counts = await listing.countListedTutorsForCourses(['c1', 'c2', 'c3']);

    expect(counts.get('c1')).toBe(1);
    expect(counts.get('c2')).toBe(1);
    expect(counts.get('c3')).toBeUndefined();
    expect(statusService.getAvailabilityStatusForTutors).toHaveBeenCalledTimes(1);
  });

  it('countListedTutorsForCourse unwraps a single course', async () => {
    notifyRepo.findListingCandidatesForCourses.mockResolvedValue([{ courseId: 'c1', tutorId: 't1' }]);
    statusService.getAvailabilityStatusForTutors.mockResolvedValue(new Map([['t1', HIDDEN]]));

    expect(await listing.countListedTutorsForCourse('c1')).toBe(0);
    expect(await listing.countListedTutorsForCourse(null)).toBe(0);
  });
});
