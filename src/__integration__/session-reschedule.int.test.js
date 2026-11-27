/**
 * Rescheduling a session by agreement, end to end against a real Postgres.
 *
 * The tutor or the student who booked proposes another time; the other one
 * accepts or declines. What must hold:
 *   - nothing moves until the other side accepts, and then the session keeps
 *     its duration and its Calendar event is moved;
 *   - only the two who decide can act: a guest of a group session cannot
 *     propose nor answer, a stranger cannot even see it;
 *   - one proposal at a time, answered once — even when two answers (or an
 *     answer and a withdrawal) land together;
 *   - a proposal dies with the session it was about: cancelled, moved by
 *     Calico, started, or with the tutor already paid;
 *   - the tutor never ends up with two sessions at once.
 *
 * Real route handlers, JWTs, services, repositories and Prisma. Replaced:
 * Google Calendar, Brevo and Vercel's waitUntil.
 */
import prisma from '@/lib/prisma';
import * as calendar from '@/lib/services/calico-calendar.service';
import * as emailService from '@/lib/services/email.service';
import { GET as mineRoute } from '@/app/api/reschedule-requests/route';
import { GET as readRoute, POST as proposeRoute } from '@/app/api/sessions/[id]/reschedule-requests/route';
import { DELETE as withdrawRoute } from '@/app/api/sessions/[id]/reschedule-requests/[requestId]/route';
import { POST as acceptRoute } from '@/app/api/sessions/[id]/reschedule-requests/[requestId]/accept/route';
import { POST as declineRoute } from '@/app/api/sessions/[id]/reschedule-requests/[requestId]/decline/route';
import { RESCHEDULE_MAX_PER_USER } from '@/lib/sessions/reschedule';
import { resetSessionData, createUser, createCourse, createTutor, bearer } from './helpers/factory';

jest.mock('@vercel/functions', () => {
  const pending = [];
  return {
    ...jest.requireActual('@vercel/functions'),
    waitUntil: (promise) => void pending.push(promise),
    __pending: pending,
  };
});
jest.mock('@/lib/services/calico-calendar.service');
jest.mock('@/lib/services/email.service');

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const EVENT_ID = 'int-evt-reschedule';

/** A whole-minute instant `hours` from now. */
function inHours(hours) {
  const d = new Date(Date.now() + hours * HOUR);
  d.setUTCSeconds(0, 0);
  return d;
}

// ─── HTTP entry points ────────────────────────────────────────────────

function request(method, path, { user = null, body } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { authorization: bearer(user) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function call(handler, req, params = {}) {
  const res = await handler(req, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
}

const base = (id) => `/api/sessions/${id}/reschedule-requests`;
const api = {
  mine: (user) => call(mineRoute, request('GET', '/api/reschedule-requests', { user })),
  read: (user, id) => call(readRoute, request('GET', base(id), { user }), { id }),
  propose: (user, id, start, message) => call(
    proposeRoute,
    request('POST', base(id), { user, body: { startTimestamp: start instanceof Date ? start.toISOString() : start, message } }),
    { id },
  ),
  accept: (user, id, requestId) => call(acceptRoute, request('POST', `${base(id)}/${requestId}/accept`, { user }), { id, requestId }),
  decline: (user, id, requestId) => call(declineRoute, request('POST', `${base(id)}/${requestId}/decline`, { user }), { id, requestId }),
  withdraw: (user, id, requestId) => call(withdrawRoute, request('DELETE', `${base(id)}/${requestId}`, { user }), { id, requestId }),
};

async function flushBackgroundWork() {
  const pending = jest.requireMock('@vercel/functions').__pending;
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

// ─── Scenario ─────────────────────────────────────────────────────────

/**
 * A 1 h 30 session two days from now, with a Calendar event. `guests` join
 * after whoever booked (a group session when there are any).
 */
async function scenario({ guests = 0, start = inHours(48), status = 'Accepted', withEvent = true } = {}) {
  const tutor = await createTutor();
  const course = await createCourse();
  const student = await createUser({ name: 'Sara Estudiante' });
  const session = await prisma.session.create({
    data: {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: guests > 0 ? 'Group' : 'Individual',
      maxCapacity: guests + 1,
      startTimestamp: start,
      endTimestamp: new Date(start.getTime() + 1.5 * HOUR),
      status,
      locationType: 'Virtual',
      googleCalendarEventId: withEvent ? EVENT_ID : null,
      googleMeetLink: withEvent ? 'https://meet.google.com/int-reschedule' : null,
      participants: { create: { studentId: student.id, joinedAt: new Date(Date.now() - HOUR) } },
    },
  });
  const guestUsers = [];
  for (let i = 0; i < guests; i += 1) {
    const guest = await createUser({ name: `Invitado ${i + 1}` });
    await prisma.sessionParticipant.create({ data: { sessionId: session.id, studentId: guest.id } });
    guestUsers.push(guest);
  }
  return { tutor, course, student, session, guests: guestUsers };
}

/** Another live session of the same tutor at `start` (1 h). */
async function otherSessionOf(tutor, course, start) {
  const someone = await createUser();
  return prisma.session.create({
    data: {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      startTimestamp: start,
      endTimestamp: new Date(start.getTime() + HOUR),
      status: 'Accepted',
      locationType: 'Virtual',
      participants: { create: { studentId: someone.id } },
    },
  });
}

const sessionRow = (id) => prisma.session.findUnique({ where: { id } });
const requestRow = (id) => prisma.sessionRescheduleRequest.findUnique({ where: { id } });
const notificationsOf = (user) => prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
const emailsTo = (user) => emailService.sendSessionRescheduleEmail.mock.calls.filter(([to]) => to === user.email);

beforeEach(async () => {
  // Notifications of the previous test may still be writing: let them land
  // before truncating, or the TRUNCATE deadlocks with them.
  await flushBackgroundWork();
  await resetSessionData();
  jest.clearAllMocks();
  calendar.rescheduleTutoringSessionEvent.mockResolvedValue({ success: true, eventId: EVENT_ID, meetLink: null });
  emailService.sendSessionRescheduleEmail.mockResolvedValue({ success: true });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Proposing ────────────────────────────────────────────────────────

describe('proposing another time', () => {
  it('a student proposes: the tutor is asked by email, notification and home card, and nothing moves', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(72);

    const res = await api.propose(student, session.id, newStart, '  Se me cruzó   un parcial ');
    expect(res).toMatchObject({ status: 201, body: { success: true, emailSent: true } });
    expect(res.body.request).toMatchObject({ requestedBy: 'student', mine: true, canRespond: false, message: 'Se me cruzó un parcial' });

    // The session is where it was.
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
    expect(calendar.rescheduleTutoringSessionEvent).not.toHaveBeenCalled();

    // The tutor is asked.
    const [email] = emailsTo(tutor);
    expect(email[1]).toBe('requested');
    expect(email[2]).toMatchObject({ actorName: 'Sara', message: 'Se me cruzó un parcial', sessionLink: `http://localhost:3000/sessions/${session.id}/detail` });
    expect(await notificationsOf(tutor)).toEqual([
      expect.objectContaining({ type: 'reschedule_requested', sessionId: session.id }),
    ]);
    expect((await api.mine(tutor)).body.requests).toEqual([
      expect.objectContaining({ id: res.body.request.id, sessionId: session.id, requestedBy: 'student', requestedByName: 'Sara' }),
    ]);
    // …and the student is not asked about their own proposal.
    expect((await api.mine(student)).body.requests).toEqual([]);

    // Each side reads it from their own seat.
    const asTutor = await api.read(tutor, session.id);
    expect(asTutor.body).toMatchObject({ role: 'tutor', canPropose: false, request: { mine: false, canRespond: true, message: 'Se me cruzó un parcial' } });
    const asStudent = await api.read(student, session.id);
    expect(asStudent.body).toMatchObject({ role: 'organizer', canPropose: false, request: { mine: true, canRespond: false } });
    expect(new Date(asStudent.body.request.toEnd).getTime() - new Date(asStudent.body.request.toStart).getTime()).toBe(1.5 * HOUR);
  });

  it('a tutor proposes: the student who booked is the one asked', async () => {
    const { tutor, student, session } = await scenario();

    const res = await api.propose(tutor, session.id, inHours(30));
    expect(res).toMatchObject({ status: 201, body: { request: { requestedBy: 'tutor', mine: true } } });

    expect(emailsTo(student)).toHaveLength(1);
    expect((await api.mine(student)).body.requests).toHaveLength(1);
    expect((await api.read(student, session.id)).body.request).toMatchObject({ canRespond: true, mine: false });
  });

  it('rounds the proposed time to the whole minute', async () => {
    const { student, session } = await scenario();
    const typed = new Date(inHours(72).getTime() + 37_500);

    const res = await api.propose(student, session.id, typed);
    expect(new Date(res.body.request.toStart).getTime()).toBe(typed.getTime() - 37_500);
  });

  it('still records the proposal when the email cannot be sent', async () => {
    const { tutor, student, session } = await scenario();
    emailService.sendSessionRescheduleEmail.mockRejectedValueOnce(new Error('Brevo down'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await api.propose(student, session.id, inHours(72));
    error.mockRestore();

    expect(res).toMatchObject({ status: 201, body: { emailSent: false } });
    expect(await notificationsOf(tutor)).toHaveLength(1);
    expect((await api.mine(tutor)).body.requests).toHaveLength(1);
  });

  it('refuses times that make no sense', async () => {
    const { student, session } = await scenario();

    expect(await api.propose(student, session.id, inHours(-2))).toMatchObject({ status: 400, body: { error: 'START_IN_PAST' } });
    expect(await api.propose(student, session.id, session.startTimestamp)).toMatchObject({ status: 400, body: { error: 'SAME_TIME' } });
    expect(await api.propose(student, session.id, new Date(Date.now() + 120 * DAY))).toMatchObject({ status: 400, body: { error: 'TOO_FAR_AHEAD' } });
    expect(await api.propose(student, session.id, 'mañana a las 4')).toMatchObject({ status: 400, body: { error: 'INVALID_TIME' } });
    expect(await api.propose(student, session.id, inHours(72), 'x'.repeat(301))).toMatchObject({ status: 400, body: { error: 'MESSAGE_TOO_LONG' } });
    expect(await prisma.sessionRescheduleRequest.count()).toBe(0);
  });

  it('refuses a time when the tutor already has another session', async () => {
    const { tutor, course, student, session } = await scenario();
    const taken = inHours(72);
    await otherSessionOf(tutor, course, taken);

    // Overlaps its last half hour (the session lasts 1 h 30).
    expect(await api.propose(student, session.id, new Date(taken.getTime() - HOUR))).toMatchObject({ status: 409, body: { error: 'SESSION_CONFLICT' } });
    // Right after it is fine.
    expect(await api.propose(student, session.id, new Date(taken.getTime() + HOUR))).toMatchObject({ status: 201 });
  });

  it('refuses a session that is cancelled, already started or already paid to the tutor', async () => {
    const cancelled = await scenario({ status: 'Canceled' });
    expect(await api.propose(cancelled.student, cancelled.session.id, inHours(72))).toMatchObject({ status: 409, body: { error: 'SESSION_NOT_ACTIVE' } });
    expect((await api.read(cancelled.student, cancelled.session.id)).body).toMatchObject({ canPropose: false, request: null });

    const started = await scenario({ start: inHours(-0.5) });
    expect(await api.propose(started.tutor, started.session.id, inHours(72))).toMatchObject({ status: 409, body: { error: 'SESSION_STARTED' } });

    const paid = await scenario();
    await prisma.payment.create({
      data: {
        sessionId: paid.session.id, studentId: paid.student.id, tutorId: paid.tutor.id,
        amount: 60000, originalAmount: 60000, tutorPayoutBase: 60000, status: 'paid', tutorPayoutStatus: 'paid',
      },
    });
    expect(await api.propose(paid.student, paid.session.id, inHours(72))).toMatchObject({ status: 409, body: { error: 'TUTOR_ALREADY_PAID' } });
  });

  it('allows one open proposal per session, whoever makes it', async () => {
    const { tutor, student, session } = await scenario();
    expect(await api.propose(student, session.id, inHours(72))).toMatchObject({ status: 201 });

    expect(await api.propose(student, session.id, inHours(80))).toMatchObject({ status: 409, body: { error: 'REQUEST_PENDING' } });
    expect(await api.propose(tutor, session.id, inHours(80))).toMatchObject({ status: 409, body: { error: 'REQUEST_PENDING' } });
    expect(await prisma.sessionRescheduleRequest.count()).toBe(1);
  });

  it('writes one proposal when both sides propose at the same instant', async () => {
    const { tutor, student, session } = await scenario();

    const results = await Promise.all([
      api.propose(student, session.id, inHours(72)),
      api.propose(tutor, session.id, inHours(80)),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.sessionRescheduleRequest.count({ where: { status: 'Pending' } })).toBe(1);
  });

  it(`stops after ${RESCHEDULE_MAX_PER_USER} proposals by the same person for a session`, async () => {
    const { student, session } = await scenario();
    for (let i = 0; i < RESCHEDULE_MAX_PER_USER; i += 1) {
      const res = await api.propose(student, session.id, inHours(72 + i));
      expect(res.status).toBe(201);
      expect(await api.withdraw(student, session.id, res.body.request.id)).toMatchObject({ status: 200 });
    }
    expect(await api.propose(student, session.id, inHours(90))).toMatchObject({ status: 429, body: { error: 'REQUEST_LIMIT' } });
  });
});

// ─── Answering ────────────────────────────────────────────────────────

describe('answering a proposal', () => {
  it('accepting moves the session and its calendar event, and tells whoever proposed', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(72);
    const { body: { request: proposal } } = await api.propose(student, session.id, newStart);
    jest.clearAllMocks();

    const res = await api.accept(tutor, session.id, proposal.id);
    await flushBackgroundWork();

    expect(res).toMatchObject({ status: 200, body: { success: true, calendar: 'updated' } });
    const moved = await sessionRow(session.id);
    expect(moved.startTimestamp).toEqual(newStart);
    expect(moved.endTimestamp).toEqual(new Date(newStart.getTime() + 1.5 * HOUR));
    expect(moved.status).toBe('Accepted');
    expect(moved.googleMeetLink).toBe('https://meet.google.com/int-reschedule');
    expect(calendar.rescheduleTutoringSessionEvent).toHaveBeenCalledWith(EVENT_ID, {
      startDateTime: newStart,
      endDateTime: new Date(newStart.getTime() + 1.5 * HOUR),
    });

    expect(await requestRow(proposal.id)).toMatchObject({ status: 'Accepted', respondedAt: expect.any(Date) });
    expect(emailsTo(student).map(([, kind]) => kind)).toEqual(['accepted']);
    expect((await notificationsOf(student)).map((n) => n.type)).toEqual(['reschedule_accepted']);

    // Nothing left to answer, and a new proposal can be made from the new time.
    expect((await api.mine(tutor)).body.requests).toEqual([]);
    expect((await api.read(student, session.id)).body).toMatchObject({ request: null, canPropose: true });
  });

  it('the student who booked accepts a tutor\'s proposal', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(30);
    const { body: { request: proposal } } = await api.propose(tutor, session.id, newStart);

    expect(await api.accept(student, session.id, proposal.id)).toMatchObject({ status: 200 });
    await flushBackgroundWork();

    expect((await sessionRow(session.id)).startTimestamp).toEqual(newStart);
    expect(emailsTo(tutor).map(([, kind]) => kind)).toEqual(['accepted']);
  });

  it('declining leaves the session where it was and tells whoever proposed', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));
    jest.clearAllMocks();

    expect(await api.decline(tutor, session.id, proposal.id)).toMatchObject({ status: 200, body: { success: true } });
    await flushBackgroundWork();

    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
    expect(calendar.rescheduleTutoringSessionEvent).not.toHaveBeenCalled();
    expect((await requestRow(proposal.id)).status).toBe('Declined');
    expect(emailsTo(student).map(([, kind]) => kind)).toEqual(['declined']);
    expect((await notificationsOf(student)).map((n) => n.type)).toEqual(['reschedule_declined']);

    // The answer is final…
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'REQUEST_NOT_PENDING' } });
    // …and another time can be proposed.
    expect(await api.propose(student, session.id, inHours(80))).toMatchObject({ status: 201 });
  });

  it('whoever proposed can take it back, and only they', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));

    expect(await api.withdraw(tutor, session.id, proposal.id)).toMatchObject({ status: 403, body: { error: 'FORBIDDEN' } });
    expect(await api.withdraw(student, session.id, proposal.id)).toMatchObject({ status: 200 });
    await flushBackgroundWork();

    expect((await requestRow(proposal.id)).status).toBe('Withdrawn');
    expect((await notificationsOf(tutor)).map((n) => n.type)).toEqual(['reschedule_requested', 'reschedule_withdrawn']);
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'REQUEST_NOT_PENDING' } });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
  });

  it('nobody answers their own proposal', async () => {
    const { student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));

    expect(await api.accept(student, session.id, proposal.id)).toMatchObject({ status: 403, body: { error: 'FORBIDDEN' } });
    expect(await api.decline(student, session.id, proposal.id)).toMatchObject({ status: 403, body: { error: 'FORBIDDEN' } });
    expect((await requestRow(proposal.id)).status).toBe('Pending');
  });

  it('a proposal of another session cannot be answered through this one', async () => {
    const a = await scenario();
    const b = await scenario();
    const { body: { request: proposal } } = await api.propose(a.student, a.session.id, inHours(72));

    expect(await api.accept(b.tutor, b.session.id, proposal.id)).toMatchObject({ status: 404 });
    expect((await requestRow(proposal.id)).status).toBe('Pending');
  });

  it('moves the session even when the calendar event cannot be moved, and says so', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(72);
    const { body: { request: proposal } } = await api.propose(student, session.id, newStart);
    calendar.rescheduleTutoringSessionEvent.mockRejectedValueOnce(Object.assign(new Error('calendar'), { code: 'CALENDAR_UNAVAILABLE' }));
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await api.accept(tutor, session.id, proposal.id);
    error.mockRestore();

    expect(res).toMatchObject({ status: 200, body: { calendar: 'failed' } });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(newStart);
  });

  it('reports no calendar when the session has no event', async () => {
    const { tutor, student, session } = await scenario({ withEvent: false });
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));

    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 200, body: { calendar: 'none' } });
    expect(calendar.rescheduleTutoringSessionEvent).not.toHaveBeenCalled();
  });
});

// ─── Races ────────────────────────────────────────────────────────────

describe('answers that land together', () => {
  it('a proposal accepted twice at once moves the session once', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(72);
    const { body: { request: proposal } } = await api.propose(student, session.id, newStart);
    jest.clearAllMocks();

    const results = await Promise.all([
      api.accept(tutor, session.id, proposal.id),
      api.accept(tutor, session.id, proposal.id),
    ]);
    await flushBackgroundWork();

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await sessionRow(session.id)).startTimestamp).toEqual(newStart);
    expect(calendar.rescheduleTutoringSessionEvent).toHaveBeenCalledTimes(1);
    expect(emailsTo(student)).toHaveLength(1);
  });

  it('accepted and withdrawn at once: one of the two wins and the session agrees with it', async () => {
    const { tutor, student, session } = await scenario();
    const newStart = inHours(72);
    const { body: { request: proposal } } = await api.propose(student, session.id, newStart);

    const [accepted, withdrawn] = await Promise.all([
      api.accept(tutor, session.id, proposal.id),
      api.withdraw(student, session.id, proposal.id),
    ]);
    await flushBackgroundWork();

    expect([accepted.status, withdrawn.status].sort()).toEqual([200, 409]);
    const row = await requestRow(proposal.id);
    const moved = await sessionRow(session.id);
    if (accepted.status === 200) {
      expect(row.status).toBe('Accepted');
      expect(moved.startTimestamp).toEqual(newStart);
    } else {
      expect(row.status).toBe('Withdrawn');
      expect(moved.startTimestamp).toEqual(session.startTimestamp);
    }
  });

  it('two sessions of a tutor accepted onto the same time: only one gets it', async () => {
    const a = await scenario();
    const target = inHours(96);
    // A second session of the SAME tutor, with its own student.
    const otherStudent = await createUser({ name: 'Otro Estudiante' });
    const b = await prisma.session.create({
      data: {
        courseId: a.course.id, tutorId: a.tutor.id, sessionType: 'Individual', status: 'Accepted', locationType: 'Virtual',
        startTimestamp: inHours(60), endTimestamp: inHours(61.5),
        participants: { create: { studentId: otherStudent.id } },
      },
    });
    const pa = (await api.propose(a.student, a.session.id, target)).body.request;
    const pb = (await api.propose(otherStudent, b.id, target)).body.request;
    expect(pa && pb).toBeTruthy();

    const results = await Promise.all([
      api.accept(a.tutor, a.session.id, pa.id),
      api.accept(a.tutor, b.id, pb.id),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const atTarget = await prisma.session.count({ where: { tutorId: a.tutor.id, startTimestamp: target } });
    expect(atTarget).toBe(1);
  });
});

// ─── A proposal dies with the session it was about ────────────────────

describe('a proposal about a session that changed', () => {
  it('cannot be accepted once the session is cancelled', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));
    await prisma.session.update({ where: { id: session.id }, data: { status: 'Canceled' } });

    expect((await api.mine(tutor)).body.requests).toEqual([]);
    expect((await api.read(tutor, session.id)).body).toMatchObject({ request: null, canPropose: false });
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'SESSION_NOT_ACTIVE' } });
    expect((await requestRow(proposal.id)).status).toBe('Expired');
    expect((await sessionRow(session.id)).status).toBe('Canceled');
  });

  it('cannot be accepted once Calico moved the session, and a new one can be made', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));
    const adminStart = inHours(50);
    await prisma.session.update({
      where: { id: session.id },
      data: { startTimestamp: adminStart, endTimestamp: new Date(adminStart.getTime() + 1.5 * HOUR) },
    });

    expect((await api.mine(tutor)).body.requests).toEqual([]);
    expect((await api.read(student, session.id)).body).toMatchObject({ request: null, canPropose: true });
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'SESSION_CHANGED' } });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(adminStart);

    // The stale proposal no longer blocks a new one.
    const again = await prisma.sessionRescheduleRequest.update({ where: { id: proposal.id }, data: { status: 'Pending' } });
    expect(again.status).toBe('Pending');
    expect(await api.propose(tutor, session.id, inHours(80))).toMatchObject({ status: 201 });
    expect((await requestRow(proposal.id)).status).toBe('Expired');
  });

  it('cannot be accepted once the session went to another tutor', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));
    const newTutor = await createTutor();
    await prisma.session.update({ where: { id: session.id }, data: { tutorId: newTutor.id } });

    // The previous tutor is no longer in the session at all.
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 404 });
    expect((await api.read(newTutor, session.id)).body).toMatchObject({ request: null, canPropose: true });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
  });

  it('cannot be accepted when the tutor took another session at that time meanwhile', async () => {
    const { tutor, course, student, session } = await scenario();
    const newStart = inHours(72);
    const { body: { request: proposal } } = await api.propose(student, session.id, newStart);
    const blocker = await otherSessionOf(tutor, course, newStart);

    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'SESSION_CONFLICT' } });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
    // It stays open: if the other session goes away, it can still be accepted.
    expect((await requestRow(proposal.id)).status).toBe('Pending');
    await prisma.session.update({ where: { id: blocker.id }, data: { status: 'Canceled' } });
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 200 });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(newStart);
  });

  it('cannot be accepted once the tutor was paid for the session', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));
    await prisma.payment.create({
      data: {
        sessionId: session.id, studentId: student.id, tutorId: tutor.id,
        amount: 60000, originalAmount: 60000, tutorPayoutBase: 60000, status: 'paid', tutorPayoutStatus: 'paid',
      },
    });

    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'TUTOR_ALREADY_PAID' } });
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
  });

  it('expires when the proposed time passes without an answer', async () => {
    const { tutor, student, session } = await scenario();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(20));
    // Time goes by: the proposed hour is now behind us.
    await prisma.sessionRescheduleRequest.update({
      where: { id: proposal.id },
      data: { toStart: inHours(-1), toEnd: inHours(0.5) },
    });

    expect((await api.mine(tutor)).body.requests).toEqual([]);
    expect((await api.read(tutor, session.id)).body.request).toBeNull();
    expect(await api.accept(tutor, session.id, proposal.id)).toMatchObject({ status: 409, body: { error: 'REQUEST_EXPIRED' } });
    expect((await requestRow(proposal.id)).status).toBe('Expired');
    expect((await sessionRow(session.id)).startTimestamp).toEqual(session.startTimestamp);
  });
});

// ─── Who can do what ──────────────────────────────────────────────────

describe('who can propose and answer', () => {
  it('a stranger sees nothing and can do nothing', async () => {
    const { student, session } = await scenario();
    const stranger = await createUser();
    const { body: { request: proposal } } = await api.propose(student, session.id, inHours(72));

    expect(await api.read(stranger, session.id)).toMatchObject({ status: 404 });
    expect(await api.propose(stranger, session.id, inHours(80))).toMatchObject({ status: 404 });
    expect(await api.accept(stranger, session.id, proposal.id)).toMatchObject({ status: 404 });
    expect(await api.decline(stranger, session.id, proposal.id)).toMatchObject({ status: 404 });
    expect(await api.withdraw(stranger, session.id, proposal.id)).toMatchObject({ status: 404 });
    expect((await requestRow(proposal.id)).status).toBe('Pending');
  });

  it('requires a session', async () => {
    const { session } = await scenario();
    expect((await api.read(null, session.id)).status).toBe(401);
    expect((await api.propose(null, session.id, inHours(72))).status).toBe(401);
    expect((await api.mine(null)).status).toBe(401);
  });

  it('in a group session whoever booked speaks for the students; guests are told when it moves', async () => {
    const { tutor, student, session, guests: [guest, secondGuest] } = await scenario({ guests: 2 });
    const newStart = inHours(72);

    // A guest cannot propose.
    expect(await api.propose(guest, session.id, newStart)).toMatchObject({ status: 403, body: { error: 'GUEST_CANNOT_RESCHEDULE' } });

    // The tutor's proposal goes to whoever booked — not to the guests.
    const { body: { request: proposal } } = await api.propose(tutor, session.id, newStart, 'Tengo comité');
    expect(await requestRow(proposal.id)).toMatchObject({ respondentId: student.id });
    expect(emailsTo(guest)).toHaveLength(0);
    expect((await api.mine(guest)).body.requests).toEqual([]);

    // A guest sees that a change is proposed, without the note, and cannot answer.
    const asGuest = await api.read(guest, session.id);
    expect(asGuest.body).toMatchObject({ role: 'guest', canPropose: false, request: { canRespond: false, mine: false, message: null } });
    expect(await api.accept(guest, session.id, proposal.id)).toMatchObject({ status: 403, body: { error: 'GUEST_CANNOT_RESCHEDULE' } });
    expect(await api.decline(guest, session.id, proposal.id)).toMatchObject({ status: 403 });

    // Whoever booked accepts: every guest is told.
    expect(await api.accept(student, session.id, proposal.id)).toMatchObject({ status: 200 });
    await flushBackgroundWork();
    expect((await sessionRow(session.id)).startTimestamp).toEqual(newStart);
    for (const g of [guest, secondGuest]) {
      expect((await notificationsOf(g)).map((n) => n.type)).toEqual(['session_rescheduled']);
    }
    // The two who decided get their own messages instead.
    expect((await notificationsOf(student)).map((n) => n.type)).toEqual(['reschedule_requested']);
    expect((await notificationsOf(tutor)).map((n) => n.type)).toEqual(['reschedule_accepted']);
  });
});
