/**
 * Authorization of routes that used to trust any logged-in user, exercised
 * through the real handlers with real JWTs against a real Postgres: the
 * guards read the role / ownership from the DB, never from the token.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { POST as createNotification } from '@/app/api/notifications/route';
import { GET as getSessionReviews } from '@/app/api/sessions/[id]/reviews/route';
import { resetEventData, createUser, createCourse, createSession, authHeaders } from './helpers/factory';

const HOUR_MS = 3_600_000;

function postNotification(caller, body, claims) {
  return createNotification(
    new Request('http://localhost/api/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(caller, claims) },
      body: JSON.stringify(body),
    }),
  );
}

function readSessionReviews(caller, sessionId, claims) {
  return getSessionReviews(
    new Request(`http://localhost/api/sessions/${sessionId}/reviews`, { headers: authHeaders(caller, claims) }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('POST /api/notifications is admin-only (role read from the DB)', () => {
  const notificationsOf = (userId) => prisma.notification.count({ where: { userId } });

  it('test_should_reject_a_student_creating_a_notification_for_another_user', async () => {
    const student = await createUser();
    const victim = await createUser();

    const res = await postNotification(student, { userId: victim.id, type: 'SYSTEM', message: 'Pay here: evil.example' });

    expect(res.status).toBe(403);
    expect(await notificationsOf(victim.id)).toBe(0);
  });

  it('test_should_let_a_db_admin_create_a_notification', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const target = await createUser();

    const res = await postNotification(admin, { userId: target.id, type: 'SYSTEM', message: 'Mantenimiento programado' });

    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await prisma.notification.findUnique({ where: { id: body.notification.id } });
    expect(row).toMatchObject({ userId: target.id, type: 'SYSTEM', message: 'Mantenimiento programado' });
  });

  it('test_should_reject_a_jwt_that_claims_admin_when_the_db_role_is_student', async () => {
    const student = await createUser();
    const target = await createUser();

    const res = await postNotification(
      student,
      { userId: target.id, type: 'SYSTEM', message: 'forged admin' },
      { role: 'ADMIN' },
    );

    expect(res.status).toBe(403);
    expect(await notificationsOf(target.id)).toBe(0);
  });
});

describe('GET /api/sessions/[id]/reviews is limited to the session tutor, its students and DB admins', () => {
  async function sessionWithReview() {
    const tutor = await createUser({ isTutorApproved: true });
    const student = await createUser();
    const course = await createCourse();
    const session = await createSession({
      tutor,
      student,
      course,
      start: new Date(Date.now() - 48 * HOUR_MS),
      status: 'Completed',
    });
    await prisma.review.create({
      data: { sessionId: session.id, tutorId: tutor.id, studentId: student.id, rating: 5, comment: 'Muy clara', status: 'done' },
    });
    return { tutor, student, session };
  }

  it('test_should_return_the_reviews_to_the_session_tutor', async () => {
    const { tutor, session } = await sessionWithReview();
    const res = await readSessionReviews(tutor, session.id);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it('test_should_return_the_reviews_to_a_participant_student', async () => {
    const { student, session } = await sessionWithReview();
    const res = await readSessionReviews(student, session.id);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it('test_should_forbid_an_unrelated_student', async () => {
    const { session } = await sessionWithReview();
    const outsider = await createUser();
    const res = await readSessionReviews(outsider, session.id);
    expect(res.status).toBe(403);
    expect((await res.json()).reviews).toBeUndefined();
  });

  it('test_should_forbid_an_unrelated_user_whose_jwt_claims_admin', async () => {
    const { session } = await sessionWithReview();
    const outsider = await createUser();
    const res = await readSessionReviews(outsider, session.id, { role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('test_should_return_the_reviews_to_a_db_admin', async () => {
    const { session } = await sessionWithReview();
    const admin = await createUser({ role: 'ADMIN' });
    const res = await readSessionReviews(admin, session.id);
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
  });

  it('test_should_return_404_for_an_unknown_session', async () => {
    const student = await createUser();
    const res = await readSessionReviews(student, randomUUID());
    expect(res.status).toBe(404);
  });
});

describe('removed calendar mutation routes', () => {
  it('test_should_not_ship_the_unauthenticated_calico_calendar_tutoring_session_routes', () => {
    // These routes created/cancelled events on the central calendar with no
    // auth; the server now does it only from the session lifecycle.
    const dir = path.join(process.cwd(), 'src/app/api/calico-calendar/tutoring-session');
    expect(fs.existsSync(dir)).toBe(false);
  });
});
