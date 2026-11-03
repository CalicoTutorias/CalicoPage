/**
 * Manual sessions against a real Postgres: what mocked repositories cannot
 * check. The tutor is credited once however many uploads race (a conditional
 * update inside a transaction), the Prisma filters pick the right tutors and
 * sessions, and the proof key stays out of what students and tutors can read.
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { findOfferingTutorsForCourse } from '@/lib/repositories/academic.repository';
import {
  createSessionWithParticipant, findManualSessionById, findManualSessions,
} from '@/lib/repositories/session.repository';
import {
  create as createPayment, findById, findBySessionId, findByStudentId, findByTutorId, markManualPaymentPaid,
} from '@/lib/repositories/payment.repository';
import { createCourse, createUser } from './helpers/factory';

const PROOF_KEY = 'manual-payment-proofs/session/a1b2c3d4e5f6.png';

let hourOffset = 0;

/** A session on its own hour, so the sessions of one tutor never overlap. */
async function createSession({ tutor, student, course, source = 'ManualAdmin' }) {
  hourOffset += 2;
  const start = new Date(Date.UTC(2030, 0, 1, hourOffset));
  return createSessionWithParticipant(
    {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: start,
      endTimestamp: new Date(start.getTime() + 60 * 60_000),
      status: 'Accepted',
      locationType: 'Virtual',
      source,
    },
    student.id,
    15,
  );
}

async function setup() {
  const tutor = await createUser({ isTutorApproved: true });
  const student = await createUser();
  const course = await createCourse();
  const session = await createSession({ tutor, student, course });
  const payment = await createPayment({
    sessionId: session.id,
    studentId: student.id,
    tutorId: tutor.id,
    amount: 50000,
    status: 'pending',
  });
  return { tutor, student, course, session, payment };
}

const nextPaymentOf = async (tutorId) => Number(
  (await prisma.tutorProfile.findUnique({ where: { userId: tutorId } })).nextPayment,
);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('markManualPaymentPaid', () => {
  it('marks the payment paid with its proof and credits the tutor', async () => {
    const { tutor, payment } = await setup();

    const updated = await markManualPaymentPaid(payment.id, {
      tutorId: tutor.id,
      tutorPayoutBase: 50000,
      proofS3Key: PROOF_KEY,
    });

    expect(updated.status).toBe('paid');
    expect(updated.proofS3Key).toBe(PROOF_KEY);
    expect(updated.proofUploadedAt).toBeInstanceOf(Date);
    expect(await nextPaymentOf(tutor.id)).toBe(50000);
  });

  it('credits the tutor once when uploads race', async () => {
    const { tutor, payment } = await setup();

    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => markManualPaymentPaid(payment.id, {
      tutorId: tutor.id,
      tutorPayoutBase: 50000,
      proofS3Key: `${PROOF_KEY}-${i}`,
    })));

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await nextPaymentOf(tutor.id)).toBe(50000);
  });

  it('does nothing on a payment that is no longer pending', async () => {
    const { tutor, payment } = await setup();
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });

    await expect(markManualPaymentPaid(payment.id, {
      tutorId: tutor.id,
      tutorPayoutBase: 50000,
      proofS3Key: PROOF_KEY,
    })).resolves.toBeNull();

    expect(await nextPaymentOf(tutor.id)).toBe(0);
  });

  it('leaves the payment pending when crediting the tutor fails', async () => {
    const { payment } = await setup();

    await expect(markManualPaymentPaid(payment.id, {
      tutorId: randomUUID(), // no such tutor profile
      tutorPayoutBase: 50000,
      proofS3Key: PROOF_KEY,
    })).rejects.toThrow();

    const stored = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(stored.status).toBe('pending');
    expect(stored.proofS3Key).toBeNull();
  });
});

describe('who can read the proof key', () => {
  it('stays out of the reads that reach students and tutors', async () => {
    const { tutor, student, payment, session } = await setup();
    await markManualPaymentPaid(payment.id, { tutorId: tutor.id, tutorPayoutBase: 50000, proofS3Key: PROOF_KEY });

    const [byId, ofStudent, ofTutor] = await Promise.all([
      findById(payment.id),
      findByStudentId(student.id),
      findByTutorId(tutor.id),
    ]);

    expect(JSON.stringify([byId, ofStudent, ofTutor])).not.toContain(PROOF_KEY);
    expect(byId.status).toBe('paid');
    expect((await findBySessionId(session.id)).proofS3Key).toBe(PROOF_KEY);
  });
});

describe('findOfferingTutorsForCourse', () => {
  const link = (tutorId, courseId, status = 'Approved') => prisma.tutorCourse.create({ data: { tutorId, courseId, status } });

  it('lists only approved, active tutors with the course Approved, by name', async () => {
    const course = await createCourse();
    const zoe = await createUser({ name: 'Zoe', isTutorApproved: true });
    const ana = await createUser({ name: 'Ana', isTutorApproved: true });
    const suspended = await createUser({ name: 'Suspendida', isTutorApproved: true });
    await prisma.user.update({ where: { id: suspended.id }, data: { isActive: false } });
    const inReview = await createUser({ name: 'En revisión', isTutorApproved: true });
    const paused = await createUser({ name: 'Pausado', isTutorApproved: true });
    await link(zoe.id, course.id);
    await link(ana.id, course.id);
    await link(suspended.id, course.id);
    await link(inReview.id, course.id, 'Pending');
    await link(paused.id, course.id, 'Paused');

    expect(await findOfferingTutorsForCourse(course.id)).toEqual([
      { id: ana.id, name: 'Ana' },
      { id: zoe.id, name: 'Zoe' },
    ]);
  });

  it('lists a tutor with no availability: students would not see them, an admin may', async () => {
    const course = await createCourse();
    const tutor = await createUser({ isTutorApproved: true });
    await link(tutor.id, course.id);

    expect((await findOfferingTutorsForCourse(course.id)).map((t) => t.id)).toEqual([tutor.id]);
  });
});

describe('findManualSessions', () => {
  it('lists manual sessions only, with the contact of the student and the proof', async () => {
    const { tutor, student, course, session, payment } = await setup();
    const normal = await createSession({ tutor, student, course, source: 'Platform' });
    await markManualPaymentPaid(payment.id, { tutorId: tutor.id, tutorPayoutBase: 50000, proofS3Key: PROOF_KEY });

    const { rows } = await findManualSessions({ limit: 100, offset: 0 });
    const ids = rows.map((r) => r.id);

    expect(ids).toContain(session.id);
    expect(ids).not.toContain(normal.id);
    expect(await findManualSessionById(normal.id)).toBeNull();

    const row = await findManualSessionById(session.id);
    expect(row.participants[0].student.email).toBe(student.email);
    expect(row.payments[0].proofS3Key).toBe(PROOF_KEY);
    expect(row.participants[0].student).not.toHaveProperty('passwordHash');
  });
});
