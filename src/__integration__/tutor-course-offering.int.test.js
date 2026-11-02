/**
 * Which courses of a tutor students get to see, against a real Postgres: the
 * rule is a Prisma `where`, which tests with mocked repositories cannot check.
 * Until 2026-11 the search listed a tutor under any course they had a row for,
 * including one still under review or rejected.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { findAllTutors, findTutorsByCourse } from '@/lib/repositories/user.repository';
import { findListingCandidatesForCourses } from '@/lib/repositories/course-notify.repository';
import { pauseTutorCourse, resumeTutorCourse } from '@/lib/services/academic.service';
import { createCourse, createUser } from './helpers/factory';

/** An approved tutor with a weekly block, so they pass the candidate rule. */
async function createTutor() {
  const tutor = await createUser({ isTutorApproved: true });
  await prisma.availability.create({
    data: {
      id: randomUUID(),
      userId: tutor.id,
      dayOfWeek: 1,
      startTime: new Date('1970-01-01T09:00:00.000Z'),
      endTime: new Date('1970-01-01T17:00:00.000Z'),
      recurring: true,
    },
  });
  return tutor;
}

const link = (tutorId, courseId, status) => prisma.tutorCourse.create({ data: { tutorId, courseId, status } });
const statusOf = async (tutorId, courseId) => (
  await prisma.tutorCourse.findUnique({ where: { tutorId_courseId: { tutorId, courseId } } })
).status;

afterAll(async () => {
  await prisma.$disconnect();
});

describe('the search by course', () => {
  it('lists the tutor when the course is Approved', async () => {
    const tutor = await createTutor();
    const course = await createCourse();
    await link(tutor.id, course.id, 'Approved');

    expect((await findTutorsByCourse(course.id)).map((t) => t.id)).toEqual([tutor.id]);
  });

  it.each(['Pending', 'Rejected', 'Paused'])('does not list the tutor when the course is %s', async (status) => {
    const tutor = await createTutor();
    const course = await createCourse();
    await link(tutor.id, course.id, status);

    expect(await findTutorsByCourse(course.id)).toEqual([]);
  });

  it('the courses that come along with the tutor are only the offered ones', async () => {
    const tutor = await createTutor();
    const [offered, pending, rejected, paused] = await Promise.all([createCourse(), createCourse(), createCourse(), createCourse()]);
    await link(tutor.id, offered.id, 'Approved');
    await link(tutor.id, pending.id, 'Pending');
    await link(tutor.id, rejected.id, 'Rejected');
    await link(tutor.id, paused.id, 'Paused');

    const [found] = await findTutorsByCourse(offered.id);

    expect(found.tutorProfile.tutorCourses.map((tc) => tc.courseId)).toEqual([offered.id]);
  });
});

describe('the list of all tutors', () => {
  const listed = async (tutorId) => (await findAllTutors()).find((t) => t.id === tutorId);

  it('shows a tutor with their offered courses only', async () => {
    const tutor = await createTutor();
    const [offered, paused] = await Promise.all([createCourse(), createCourse()]);
    await link(tutor.id, offered.id, 'Approved');
    await link(tutor.id, paused.id, 'Paused');

    const found = await listed(tutor.id);

    expect(found.tutorProfile.tutorCourses.map((tc) => tc.courseId)).toEqual([offered.id]);
  });

  it('leaves out a tutor with nothing to book', async () => {
    const tutor = await createTutor();
    await link(tutor.id, (await createCourse()).id, 'Paused');
    await link(tutor.id, (await createCourse()).id, 'Pending');

    expect(await listed(tutor.id)).toBeUndefined();
  });
});

describe('pausing and resuming', () => {
  it('takes the tutor out of every list and brings them back, with the approval intact', async () => {
    const tutor = await createTutor();
    const course = await createCourse();
    await link(tutor.id, course.id, 'Approved');

    await pauseTutorCourse(tutor.id, course.id);

    expect(await statusOf(tutor.id, course.id)).toBe('Paused');
    expect(await findTutorsByCourse(course.id)).toEqual([]);
    expect(await findListingCandidatesForCourses([course.id])).toEqual([]);

    await resumeTutorCourse(tutor.id, course.id);

    expect(await statusOf(tutor.id, course.id)).toBe('Approved');
    expect((await findTutorsByCourse(course.id)).map((t) => t.id)).toEqual([tutor.id]);
    expect(await findListingCandidatesForCourses([course.id])).toEqual([{ courseId: course.id, tutorId: tutor.id }]);
  });

  it.each(['Pending', 'Rejected'])('resuming cannot approve a %s course', async (status) => {
    const tutor = await createTutor();
    const course = await createCourse();
    await link(tutor.id, course.id, status);

    await expect(resumeTutorCourse(tutor.id, course.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    expect(await statusOf(tutor.id, course.id)).toBe(status);
  });

  it('a course an admin rejected while it was paused stays rejected', async () => {
    const tutor = await createTutor();
    const course = await createCourse();
    await link(tutor.id, course.id, 'Paused');
    await prisma.tutorCourse.update({
      where: { tutorId_courseId: { tutorId: tutor.id, courseId: course.id } },
      data: { status: 'Rejected' },
    });

    await expect(resumeTutorCourse(tutor.id, course.id)).rejects.toMatchObject({ code: 'INVALID_STATE' });

    expect(await statusOf(tutor.id, course.id)).toBe('Rejected');
  });

  it('touches nobody else: another tutor of the same course stays listed', async () => {
    const [mine, other] = await Promise.all([createTutor(), createTutor()]);
    const course = await createCourse();
    await link(mine.id, course.id, 'Approved');
    await link(other.id, course.id, 'Approved');

    await pauseTutorCourse(mine.id, course.id);

    expect((await findTutorsByCourse(course.id)).map((t) => t.id)).toEqual([other.id]);
  });
});
