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
import {
  create as createUserRow, findByEmail, findById as findUserById, findContactByEmail, searchContacts, update as updateUser,
} from '@/lib/repositories/user.repository';
import {
  countBySession, create as createMaterial, findForSession,
} from '@/lib/repositories/session-material.repository';
import { upsertReview } from '@/lib/repositories/review.repository';
import { listMaterials } from '@/lib/services/session-material.service';
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

describe('contact of a manual-session student', () => {
  it('shows the WhatsApp tag to the admin reads and keeps it out of the generic ones', async () => {
    const { student, session } = await setup();

    await updateUser(student.id, { whatsappTag: 'ana.perez' });

    expect(await findUserById(student.id)).not.toHaveProperty('whatsappTag');
    expect(await findByEmail(student.email)).not.toHaveProperty('whatsappTag');
    expect((await findContactByEmail(student.email)).whatsappTag).toBe('ana.perez');
    expect((await findManualSessionById(session.id)).participants[0].student.whatsappTag).toBe('ana.perez');
  });

  it('stores several anonymous students with a tag and no phone: the empty phone does not collide', async () => {
    const build = (email) => createUserRow({
      name: 'Anónimo',
      email,
      phoneNumber: null,
      whatsappTag: 'sin.telefono',
      passwordHash: null,
      kind: 'ExternalTemporary',
      isEmailVerified: false,
      terms: false,
    });

    const first = await build(`${randomUUID()}@int.local`);
    const second = await build(`${randomUUID()}@int.local`);

    expect(first.phoneNumberNormalized).toBeNull();
    expect(second.phoneNumberNormalized).toBeNull();
    expect((await findContactByEmail(first.email)).kind).toBe('ExternalTemporary');
  });

  it('answers null for an email nobody has', async () => {
    expect(await findContactByEmail(`${randomUUID()}@int.local`)).toBeNull();
  });

  it('searches by email and name ignoring case, with registered accounts first', async () => {
    const tag = randomUUID().slice(0, 8);
    const anonymous = await createUserRow({
      name: `Anónimo ${tag}`,
      email: `a-${tag}@int.local`,
      passwordHash: null,
      kind: 'ExternalTemporary',
      isEmailVerified: false,
      terms: false,
    });
    const registered = await createUser({ name: `Ana ${tag.toUpperCase()}` });
    await updateUser(registered.id, { email: `z-${tag}@int.local` });

    const byEmail = await searchContacts(tag.toUpperCase(), 10);
    expect(byEmail.map((s) => s.email)).toEqual([`z-${tag}@int.local`, anonymous.email]);
    expect(byEmail[0]).not.toHaveProperty('passwordHash');

    // An anonymous student never matches by name: all of them are called the same.
    const byName = await searchContacts(`Anónimo ${tag}`, 10);
    expect(byName).toEqual([]);
  });
});

describe('material of a session', () => {
  it('stays locked until the student leaves a review with a comment on that session', async () => {
    const { tutor, student, course, session } = await setup();
    const data = { sessionId: session.id, fileName: 'guia.pdf', mimeType: 'application/pdf', fileSize: 10, createdById: tutor.id };
    await createMaterial({ ...data, s3Key: `session-materials/${session.id}/guia.pdf` });

    const asStudent = () => listMaterials({ sessionId: session.id, actor: { id: student.id, isAdmin: false } });
    const review = (fields) => upsertReview({ sessionId: session.id, studentId: student.id, tutorId: tutor.id, courseId: course.id, ...fields });

    expect(await asStudent()).toEqual(expect.objectContaining({ locked: true, lockReason: 'REVIEW_REQUIRED', count: 1, materials: [] }));

    await review({ rating: null, status: 'pending', comment: null });
    expect((await asStudent()).lockReason).toBe('REVIEW_REQUIRED');

    await review({ rating: 5, status: 'done', comment: null });
    expect(await asStudent()).toEqual(expect.objectContaining({ locked: true, lockReason: 'COMMENT_REQUIRED', materials: [] }));

    await review({ rating: 5, status: 'done', comment: 'Muy clara' });
    const unlocked = await asStudent();
    expect(unlocked.locked).toBe(false);
    expect(unlocked.materials.map((m) => m.fileName)).toEqual(['guia.pdf']);

    const asTutor = await listMaterials({ sessionId: session.id, actor: { id: tutor.id, isAdmin: false } });
    expect(asTutor.canManage).toBe(true);
    await expect(listMaterials({ sessionId: session.id, actor: { id: randomUUID(), isAdmin: false } }))
      .rejects.toEqual(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('counts it in the manual rows, scopes it to its session and goes away with the session', async () => {
    const { tutor, session } = await setup();
    const other = await setup();
    const data = {
      sessionId: session.id, fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 10, createdById: tutor.id,
    };

    const material = await createMaterial({ ...data, s3Key: `session-materials/${session.id}/a.pdf` });
    await createMaterial({ ...data, s3Key: `session-materials/${session.id}/b.pdf` });

    expect((await findManualSessionById(session.id))._count.materials).toBe(2);
    expect(await findForSession(session.id, material.id)).not.toBeNull();
    expect(await findForSession(other.session.id, material.id)).toBeNull();

    await expect(createMaterial({ ...data, s3Key: `session-materials/${session.id}/a.pdf` }))
      .rejects.toEqual(expect.objectContaining({ code: 'P2002' }));

    await prisma.session.delete({ where: { id: session.id } });
    expect(await countBySession(session.id)).toBe(0);
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
