/**
 * Spec §10.3 case 9: the reviews_session_xor_event CHECK (applied after
 * `db push` by globalSetup) rejects a review with neither or both of
 * session_id / event_id.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { resetEventData, createUser, createEvent, createCourse } from './helpers/factory';

const insertReview = (tutorId, studentId, sessionId, eventId) =>
  prisma.$executeRaw`
    INSERT INTO reviews (id, tutor_id, student_id, session_id, event_id, rating, status)
    VALUES (${randomUUID()}, ${tutorId}, ${studentId}, ${sessionId}, ${eventId}, 5, 'done')`;

async function fixtures() {
  const { event, tutors: [tutor] } = await createEvent();
  const student = await createUser();
  const course = await createCourse();
  const session = await prisma.session.create({
    data: {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      startTimestamp: new Date('2026-11-02T15:00:00.000Z'),
      endTimestamp: new Date('2026-11-02T16:00:00.000Z'),
      locationType: 'Virtual',
    },
  });
  return { tutor, student, event, session };
}

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('reviews_session_xor_event (real Postgres)', () => {
  it('rejects a review with neither session_id nor event_id', async () => {
    const { tutor, student } = await fixtures();
    await expect(insertReview(tutor.id, student.id, null, null)).rejects.toThrow(/reviews_session_xor_event/);
  });

  it('rejects a review with both session_id and event_id', async () => {
    const { tutor, student, event, session } = await fixtures();
    await expect(insertReview(tutor.id, student.id, session.id, event.id)).rejects.toThrow(/reviews_session_xor_event/);
  });

  it('accepts a review with exactly one of them', async () => {
    const { tutor, student, event, session } = await fixtures();
    await expect(insertReview(tutor.id, student.id, null, event.id)).resolves.toBe(1);
    await expect(insertReview(tutor.id, student.id, session.id, null)).resolves.toBe(1);
  });
});
