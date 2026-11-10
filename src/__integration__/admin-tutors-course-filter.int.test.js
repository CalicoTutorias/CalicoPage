/**
 * Admin tutors list filtered by course (real Postgres): `courseId` keeps only
 * tutors approved to teach that course — not pending, rejected or paused
 * offerings, and not tutors of other courses.
 */

import { listApprovedTutors } from '@/lib/services/admin.service';
import { createCourse, createTutor, offerCourse } from './helpers/factory';

describe('listApprovedTutors — course filter (real Postgres)', () => {
  it('test_should_list_only_tutors_approved_for_the_course', async () => {
    const course = await createCourse();
    const otherCourse = await createCourse();

    const approved = await createTutor();
    const pending = await createTutor();
    const paused = await createTutor();
    const otherTutor = await createTutor();
    await offerCourse(approved, course, 'Approved');
    await offerCourse(pending, course, 'Pending');
    await offerCourse(paused, course, 'Paused');
    await offerCourse(otherTutor, otherCourse, 'Approved');

    const filtered = await listApprovedTutors({ status: 'all', courseId: course.id });
    expect(filtered.items.map((t) => t.id)).toEqual([approved.id]);
    expect(filtered.total).toBe(1);

    const unfiltered = await listApprovedTutors({ status: 'all', limit: 200 });
    const ids = unfiltered.items.map((t) => t.id);
    for (const tutor of [approved, pending, paused, otherTutor]) expect(ids).toContain(tutor.id);
  });
});
