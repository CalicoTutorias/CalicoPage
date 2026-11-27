/**
 * Group tutoring sessions end to end against a real Postgres.
 *
 * One student books for several people and pays for every seat; the others
 * join for free by accepting an invitation. What must hold:
 *   - the charge is base price + 10 000 COP per extra person per hour, and
 *     the tutor's limit is enforced before charging;
 *   - each guest is invited once, however many times the payment is confirmed;
 *   - a seat is taken once: one link, one guest — even used twice at once;
 *   - guests never see what was paid nor each other's email, cannot cancel
 *     the session and can only leave it (which frees their seat);
 *   - only the student who booked manages the invitations.
 *
 * Real route handlers, JWTs, services, repositories and Prisma. Replaced:
 * Wompi's REST lookup, Google Calendar, Brevo and Vercel's waitUntil.
 */
import { createHash, randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import * as wompiApi from '@/lib/services/wompi-api.service';
import * as calendar from '@/lib/services/calico-calendar.service';
import * as emailService from '@/lib/services/email.service';
import { POST as createIntentRoute } from '@/app/api/payments/create-intent/route';
import { POST as webhookRoute } from '@/app/api/payments/webhook/route';
import { POST as confirmPaymentRoute } from '@/app/api/payments/confirm-payment/route';
import { GET as sessionRoute } from '@/app/api/sessions/[id]/route';
import { PUT as cancelRoute } from '@/app/api/sessions/[id]/cancel/route';
import { POST as leaveRoute } from '@/app/api/sessions/[id]/leave/route';
import { GET as listInvitationsRoute, POST as inviteRoute } from '@/app/api/sessions/[id]/invitations/route';
import { DELETE as revokeRoute } from '@/app/api/sessions/[id]/invitations/[invitationId]/route';
import { POST as resendRoute } from '@/app/api/sessions/[id]/invitations/[invitationId]/resend/route';
import { GET as myInvitationsRoute } from '@/app/api/session-invitations/route';
import { GET as previewRoute } from '@/app/api/session-invitations/[key]/route';
import { POST as acceptRoute } from '@/app/api/session-invitations/[key]/accept/route';
import { POST as declineRoute } from '@/app/api/session-invitations/[key]/decline/route';
import {
  resetSessionData,
  createUser,
  createCourse,
  createTutorWithAvailability,
  offerCourse,
  slotAt,
  bearer,
} from './helpers/factory';

jest.mock('@vercel/functions', () => {
  const pending = [];
  return {
    ...jest.requireActual('@vercel/functions'),
    waitUntil: (promise) => void pending.push(promise),
    __pending: pending,
  };
});
jest.mock('@/lib/services/wompi-api.service', () => ({
  ...jest.requireActual('@/lib/services/wompi-api.service'),
  fetchTransaction: jest.fn(),
}));
jest.mock('@/lib/services/calico-calendar.service');
jest.mock('@/lib/services/email.service');

const EVENTS_SECRET = 'test_events_integration';
process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET;
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

const PRICE = 40000; // COP per hour
const MEET_LINK = 'https://meet.google.com/int-group-link';
const EVENT_ID = 'int-evt-group';

// ─── Wompi (in-memory ledger behind the mocked REST lookup) ───────────

const ledger = new Map();

function wompiCharges(intent) {
  const tx = {
    id: `int-tx-${randomUUID()}`,
    reference: intent.reference,
    amount_in_cents: intent.amountInCents,
    currency: 'COP',
    status: 'APPROVED',
    metadata: {},
  };
  ledger.set(tx.id, tx);
  return tx;
}

function wompiEvent(tx) {
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const timestamp = Math.floor(Date.now() / 1000);
  const data = {
    transaction: { id: tx.id, status: tx.status, amount_in_cents: tx.amount_in_cents, reference: tx.reference, currency: tx.currency },
  };
  const values = properties.map((path) => path.split('.').reduce((node, key) => node[key], data));
  const checksum = createHash('sha256').update(`${values.join('')}${timestamp}${EVENTS_SECRET}`).digest('hex').toUpperCase();
  return { event: 'transaction.updated', data, environment: 'test', signature: { properties, checksum }, timestamp, sent_at: new Date().toISOString() };
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

const api = {
  createIntent: (user, body) => call(createIntentRoute, request('POST', '/api/payments/create-intent', { user, body })),
  webhook: (event) => call(webhookRoute, request('POST', '/api/payments/webhook', { body: event })),
  confirm: (user, tx) => call(confirmPaymentRoute, request('POST', '/api/payments/confirm-payment', {
    user, body: { reference: tx.reference, transactionData: { id: tx.id } },
  })),
  session: (user, id) => call(sessionRoute, request('GET', `/api/sessions/${id}`, { user }), { id }),
  cancel: (user, id, body) => call(cancelRoute, request('PUT', `/api/sessions/${id}/cancel`, { user, body }), { id }),
  leave: (user, id) => call(leaveRoute, request('POST', `/api/sessions/${id}/leave`, { user }), { id }),
  listInvitations: (user, id) => call(listInvitationsRoute, request('GET', `/api/sessions/${id}/invitations`, { user }), { id }),
  invite: (user, id, email) => call(inviteRoute, request('POST', `/api/sessions/${id}/invitations`, { user, body: { email } }), { id }),
  revoke: (user, id, invitationId) =>
    call(revokeRoute, request('DELETE', `/api/sessions/${id}/invitations/${invitationId}`, { user }), { id, invitationId }),
  resend: (user, id, invitationId) =>
    call(resendRoute, request('POST', `/api/sessions/${id}/invitations/${invitationId}/resend`, { user }), { id, invitationId }),
  mine: (user) => call(myInvitationsRoute, request('GET', '/api/session-invitations', { user })),
  preview: (user, key) => call(previewRoute, request('GET', `/api/session-invitations/${key}`, { user }), { key }),
  accept: (user, key) => call(acceptRoute, request('POST', `/api/session-invitations/${key}/accept`, { user }), { key }),
  decline: (user, key) => call(declineRoute, request('POST', `/api/session-invitations/${key}/decline`, { user }), { key }),
};

async function flushBackgroundWork() {
  const pending = jest.requireMock('@vercel/functions').__pending;
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

/** The secret token of the last invitation email sent to `email`. */
function emailedToken(email) {
  const sent = emailService.sendSessionInvitationEmail.mock.calls.filter(([to]) => to === email);
  if (sent.length === 0) throw new Error(`No invitation email was sent to ${email}`);
  const { invitationLink } = sent[sent.length - 1][1];
  return decodeURIComponent(invitationLink.split('/invitacion/')[1]);
}

// ─── Scenario ─────────────────────────────────────────────────────────

/** A tutor offering a 40 000 COP/h course, and the student who books. */
async function scenario({ maxGroupSize } = {}) {
  const tutor = await createTutorWithAvailability();
  if (maxGroupSize) await prisma.schedule.update({ where: { userId: tutor.id }, data: { maxGroupSize } });
  const course = await createCourse({ basePrice: PRICE });
  await offerCourse(tutor, course);
  const organizer = await createUser({ name: 'Olga Organiza' });
  const booking = (extra = {}) => ({
    tutorId: tutor.id,
    courseId: course.id,
    ...slotAt(),
    topicsToReview: 'Integrales dobles',
    ...extra,
  });
  return { tutor, course, organizer, booking };
}

/** Book and pay a group session; returns the session row and its Wompi transaction. */
async function bookGroup({ organizer, booking }, { groupSize, inviteEmails = [] }) {
  const res = await api.createIntent(organizer, booking({ groupSize, inviteEmails }));
  expect(res).toMatchObject({ status: 200, body: { success: true } });
  const tx = wompiCharges(res.body.intent);
  expect(await api.confirm(organizer, tx)).toMatchObject({ status: 200, body: { success: true } });
  await flushBackgroundWork();
  const session = await prisma.session.findFirst({ where: { notes: `Booked via payment intent ${tx.reference}` } });
  return { session, tx, intent: res.body.intent };
}

const participantIds = async (sessionId) =>
  (await prisma.sessionParticipant.findMany({ where: { sessionId }, orderBy: { joinedAt: 'asc' } })).map((p) => p.studentId);

const invitationsOf = (sessionId) =>
  prisma.sessionInvitation.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });

beforeEach(async () => {
  await resetSessionData();
  ledger.clear();
  jest.requireMock('@vercel/functions').__pending.length = 0;
  wompiApi.fetchTransaction.mockReset().mockImplementation(async (id) => {
    const tx = ledger.get(id);
    if (!tx) throw Object.assign(new Error(`[wompi-api] Transaction ${id} not found`), { code: 'NOT_FOUND' });
    return { ...tx };
  });
  calendar.createTutoringSessionEvent.mockReset().mockResolvedValue({ success: true, eventId: EVENT_ID, meetLink: MEET_LINK });
  calendar.updateTutoringSessionAttendees.mockReset().mockResolvedValue({ success: true, eventId: EVENT_ID });
  calendar.cancelTutoringSessionEvent.mockReset().mockResolvedValue({ success: true });
  emailService.sendSessionConfirmedEmail.mockReset().mockResolvedValue({ success: true });
  emailService.sendSessionInvitationEmail.mockReset().mockResolvedValue({ success: true });
  emailService.sendSessionCancellationToStudent.mockReset().mockResolvedValue({ success: true });
  emailService.sendSessionCancellationToTutor.mockReset().mockResolvedValue({ success: true });
  emailService.sendSessionCancellationToAdmin.mockReset().mockResolvedValue({ success: true });
});

afterEach(flushBackgroundWork);

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Booking & price ──────────────────────────────────────────────────

describe('booking a group session', () => {
  it('charges base + 10 000 per extra person per hour and books one Group session', async () => {
    const world = await scenario();
    const { session, tx, intent } = await bookGroup(world, { groupSize: 3 });

    // 1 h at 40 000 + 2 extra people × 10 000
    expect(intent.amountInCents).toBe(6_000_000);
    expect(session).toMatchObject({ sessionType: 'Group', maxCapacity: 3, status: 'Accepted' });
    expect(await participantIds(session.id)).toEqual([world.organizer.id]);

    const payments = await prisma.payment.findMany({ where: { sessionId: session.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ studentId: world.organizer.id, status: 'paid', wompiId: tx.id });
    expect(Number(payments[0].amount)).toBe(60000);
    expect(Number(payments[0].originalAmount)).toBe(60000);
    expect(Number(payments[0].groupSurcharge)).toBe(20000);
    // The surcharge is revenue like the rest: the tutor's 85 % is on the total.
    expect(Number(payments[0].tutorPayoutBase)).toBe(60000);
  });

  it('prices the surcharge by the hour (1 h 30 with 2 people)', async () => {
    const world = await scenario();
    const slot = slotAt();
    const endTimestamp = new Date(new Date(slot.startTimestamp).getTime() + 90 * 60_000).toISOString();

    const res = await api.createIntent(world.organizer, world.booking({ ...slot, endTimestamp, groupSize: 2 }));

    // 60 000 base + 1 × 10 000 × 1.5 h
    expect(res.body.intent.amountInCents).toBe(7_500_000);
  });

  it('refuses, before charging, more people than the tutor accepts', async () => {
    const world = await scenario({ maxGroupSize: 2 });

    const res = await api.createIntent(world.organizer, world.booking({ groupSize: 3 }));

    expect(res).toMatchObject({ status: 409, body: { success: false, error: 'GROUP_SIZE_NOT_ALLOWED' } });
    expect(await prisma.paymentIntent.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
  });

  it('keeps a tutor who turned groups off bookable one to one', async () => {
    const world = await scenario({ maxGroupSize: 1 });

    expect((await api.createIntent(world.organizer, world.booking({ groupSize: 2 }))).status).toBe(409);
    const single = await api.createIntent(world.organizer, world.booking());
    expect(single.status).toBe(200);
    expect(single.body.intent.amountInCents).toBe(4_000_000);
  });

  it('makes a 100 % coupon cover the base price only: the surcharge is still charged', async () => {
    const world = await scenario();
    const coupon = await prisma.coupon.create({
      data: { code: 'INTCORTESIA', discountType: 'PERCENT', discountValue: 100, absorber: 'CALICO', maxRedemptions: 5, perUserLimit: 1 },
    });

    const res = await api.createIntent(world.organizer, world.booking({ groupSize: 3, couponCode: coupon.code }));

    expect(res.status).toBe(200);
    expect(res.body.free).toBeUndefined();
    expect(res.body.intent.amountInCents).toBe(2_000_000);
    expect(res.body.pricing).toMatchObject({ originalAmount: 60000, discountAmount: 40000, amount: 20000 });
    expect(await prisma.session.count()).toBe(0); // nothing booked until Wompi approves
  });
});

// ─── Invitations ──────────────────────────────────────────────────────

describe('invitations', () => {
  it('invites each guest once, even when webhook and confirm-payment both land', async () => {
    const world = await scenario();
    const friend = await createUser({ name: 'Felipe Amigo' });
    const res = await api.createIntent(world.organizer, world.booking({
      groupSize: 3, inviteEmails: [friend.email.toUpperCase(), 'sin-cuenta@int.local'],
    }));
    const tx = wompiCharges(res.body.intent);

    const [hook, confirm] = await Promise.all([api.webhook(wompiEvent(tx)), api.confirm(world.organizer, tx)]);
    expect(hook.status).toBe(200);
    expect([200, 202]).toContain(confirm.status);
    await flushBackgroundWork();

    const session = await prisma.session.findFirst({ where: { tutorId: world.tutor.id } });
    const invitations = await invitationsOf(session.id);
    expect(invitations.map((i) => i.email).sort()).toEqual([friend.email, 'sin-cuenta@int.local'].sort());
    expect(invitations.every((i) => i.status === 'Pending' && i.sentCount === 1)).toBe(true);
    expect(emailService.sendSessionInvitationEmail).toHaveBeenCalledTimes(2);

    // Only the guest who already has an account is pinged in the app.
    const pings = await prisma.notification.findMany({ where: { type: 'session_invitation' } });
    expect(pings.map((n) => n.userId)).toEqual([friend.id]);
    // The token is never stored: only its hash.
    expect(invitations.map((i) => i.tokenHash)).not.toContain(emailedToken(friend.email));
  });

  it('lets a guest see the invitation without an account and without leaking the session', async () => {
    const world = await scenario();
    await bookGroup(world, { groupSize: 2, inviteEmails: ['nuevo@int.local'] });

    const res = await api.preview(null, emailedToken('nuevo@int.local'));

    expect(res.status).toBe(200);
    expect(res.body.invitation).toMatchObject({
      state: 'open', inviterName: 'Olga', seats: { total: 2, taken: 1 }, tutor: { name: 'Int Tutor' },
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(world.organizer.email);
    expect(text).not.toContain(MEET_LINK);
    expect(text).not.toContain('60000');
  });

  it('adds the guest to the session, its calendar event and emails the Meet when they accept', async () => {
    const world = await scenario();
    const friend = await createUser({ name: 'Felipe Amigo' });
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: [friend.email] });

    // From their own account: the invitation id is enough, the email matches.
    const [mine] = (await api.mine(friend)).body.invitations;
    const res = await api.accept(friend, mine.id);
    await flushBackgroundWork();

    expect(res).toMatchObject({ status: 200, body: { success: true, alreadyJoined: false } });
    expect(res.body.session.googleMeetLink).toBe(MEET_LINK);
    expect(res.body.session.payments).toEqual([]); // a guest never sees the charge
    expect(await participantIds(session.id)).toEqual([world.organizer.id, friend.id]);
    expect(calendar.updateTutoringSessionAttendees).toHaveBeenCalledWith(EVENT_ID, {
      add: { email: friend.email, name: friend.name },
    });
    expect(emailService.sendSessionConfirmedEmail).toHaveBeenCalledWith(friend.email, expect.objectContaining({ meetLink: MEET_LINK }));
    expect((await invitationsOf(session.id))[0]).toMatchObject({ status: 'Accepted', acceptedById: friend.id });
    // The guest will be asked to rate the tutor like any student.
    expect(await prisma.review.count({ where: { sessionId: session.id, studentId: friend.id } })).toBe(1);
    // Still one payment, of the organiser.
    expect(await prisma.payment.count({ where: { sessionId: session.id } })).toBe(1);
    expect((await api.mine(friend)).body.invitations).toEqual([]);
  });

  it('accepts the emailed link from an account under another address', async () => {
    const world = await scenario();
    const other = await createUser({ name: 'Otra Cuenta' });
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['uni@int.local'] });

    const res = await api.accept(other, emailedToken('uni@int.local'));

    expect(res.status).toBe(200);
    expect(await participantIds(session.id)).toEqual([world.organizer.id, other.id]);
  });

  it('is idempotent for the same guest and dead for anyone else once used', async () => {
    const world = await scenario();
    const [first, second] = [await createUser(), await createUser()];
    const { session } = await bookGroup(world, { groupSize: 3, inviteEmails: ['a@int.local'] });
    const token = emailedToken('a@int.local');

    expect((await api.accept(first, token)).status).toBe(200);
    expect(await api.accept(first, token)).toMatchObject({ status: 200, body: { alreadyJoined: true } });
    expect(await api.accept(second, token)).toMatchObject({ status: 409, body: { error: 'INVITATION_NOT_PENDING' } });
    expect(await participantIds(session.id)).toEqual([world.organizer.id, first.id]);
  });

  it('gives one link to one guest when two use it at the same instant', async () => {
    const world = await scenario();
    const [a, b] = [await createUser(), await createUser()];
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['last@int.local'] });
    const token = emailedToken('last@int.local');

    const results = await Promise.all([api.accept(a, token), api.accept(b, token)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await participantIds(session.id)).toHaveLength(2);
    expect(await prisma.sessionInvitation.count({ where: { sessionId: session.id, status: 'Accepted' } })).toBe(1);
  });

  it('refuses the tutor, strangers by id, and anyone not logged in', async () => {
    const world = await scenario();
    const stranger = await createUser();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['x@int.local'] });
    const [invitation] = await invitationsOf(session.id);
    const token = emailedToken('x@int.local');

    expect(await api.accept(world.tutor, token)).toMatchObject({ status: 409, body: { error: 'SELF_BOOKING' } });
    // The id only works for the account it was addressed to.
    expect((await api.accept(stranger, invitation.id)).status).toBe(404);
    expect((await api.preview(stranger, invitation.id)).status).toBe(404);
    expect((await api.preview(null, invitation.id)).status).toBe(401);
    expect((await api.accept(null, token)).status).toBe(401);
    expect((await api.preview(null, 'no-such-token')).status).toBe(404);
    expect(await participantIds(session.id)).toEqual([world.organizer.id]);
  });

  it('frees the seat when a guest declines, without an account', async () => {
    const world = await scenario();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['no@int.local'] });
    const token = emailedToken('no@int.local');

    expect((await api.decline(null, token)).status).toBe(200);
    expect(await api.decline(null, token)).toMatchObject({ status: 409, body: { error: 'INVITATION_NOT_PENDING' } });

    const seats = (await api.listInvitations(world.organizer, session.id)).body.seats;
    expect(seats).toEqual({ total: 2, taken: 1, pending: 0, free: 1 });
    expect((await api.invite(world.organizer, session.id, 'otro@int.local')).status).toBe(201);
  });
});

// ─── Managing the group ───────────────────────────────────────────────

describe('managing invitations', () => {
  it('never invites more people than seats were paid for', async () => {
    const world = await scenario();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['a@int.local'] });

    const res = await api.invite(world.organizer, session.id, 'b@int.local');

    expect(res).toMatchObject({ status: 409, body: { error: 'NO_SEATS_LEFT' } });
    expect(await invitationsOf(session.id)).toHaveLength(1);
  });

  it('lets the organiser swap a pending guest: the old link dies', async () => {
    const world = await scenario();
    const guest = await createUser();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['a@int.local'] });
    const [first] = await invitationsOf(session.id);
    const oldToken = emailedToken('a@int.local');

    expect((await api.revoke(world.organizer, session.id, first.id)).status).toBe(200);
    expect((await api.invite(world.organizer, session.id, 'b@int.local')).status).toBe(201);

    expect(await api.accept(guest, oldToken)).toMatchObject({ status: 409, body: { error: 'INVITATION_NOT_PENDING' } });
    expect((await api.accept(guest, emailedToken('b@int.local'))).status).toBe(200);
  });

  it('re-sends with a new link, a cooldown and a cap', async () => {
    const world = await scenario();
    const guest = await createUser();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['a@int.local'] });
    const [invitation] = await invitationsOf(session.id);
    const firstToken = emailedToken('a@int.local');

    expect(await api.resend(world.organizer, session.id, invitation.id)).toMatchObject({ status: 429, body: { error: 'RESEND_TOO_SOON' } });

    await prisma.sessionInvitation.update({ where: { id: invitation.id }, data: { lastSentAt: new Date(Date.now() - 3_600_000) } });
    expect((await api.resend(world.organizer, session.id, invitation.id)).status).toBe(200);
    const secondToken = emailedToken('a@int.local');
    expect(secondToken).not.toBe(firstToken);
    expect((await api.preview(null, firstToken)).status).toBe(404);

    await prisma.sessionInvitation.update({ where: { id: invitation.id }, data: { sentCount: 3, lastSentAt: new Date(Date.now() - 3_600_000) } });
    expect(await api.resend(world.organizer, session.id, invitation.id)).toMatchObject({ status: 429, body: { error: 'RESEND_LIMIT' } });

    expect((await api.accept(guest, secondToken)).status).toBe(200);
  });

  it('refuses the organiser, the tutor, a repeated guest and someone already inside', async () => {
    const world = await scenario();
    const friend = await createUser();
    const { session } = await bookGroup(world, { groupSize: 4, inviteEmails: [friend.email] });
    await api.accept(friend, emailedToken(friend.email));

    const refused = async (email, error) =>
      expect(await api.invite(world.organizer, session.id, email)).toMatchObject({ body: { success: false, error } });
    await refused(world.organizer.email, 'INVITE_SELF');
    await refused(world.tutor.email, 'INVITE_SELF');
    await refused('nope', 'INVITE_INVALID_EMAIL');
    await refused(friend.email.toUpperCase(), 'ALREADY_INVITED');
    expect((await api.invite(world.organizer, session.id, 'c@int.local')).status).toBe(201);
    await refused('C@int.local', 'ALREADY_INVITED');
  });

  it('keeps invitations away from guests, the tutor and outsiders', async () => {
    const world = await scenario();
    const friend = await createUser();
    const outsider = await createUser();
    const { session } = await bookGroup(world, { groupSize: 3, inviteEmails: [friend.email, 'p@int.local'] });
    await api.accept(friend, emailedToken(friend.email));
    const pending = (await invitationsOf(session.id)).find((i) => i.status === 'Pending');

    for (const user of [friend, world.tutor, outsider]) {
      expect((await api.invite(user, session.id, 'z@int.local')).status).toBe(403);
      expect((await api.revoke(user, session.id, pending.id)).status).toBe(403);
      expect((await api.resend(user, session.id, pending.id)).status).toBe(403);
    }
    expect((await api.listInvitations(outsider, session.id)).status).toBe(403);

    // The tutor and the guests get the seat counts, never the invited addresses.
    for (const user of [friend, world.tutor]) {
      const list = await api.listInvitations(user, session.id);
      expect(list.body).toMatchObject({ seats: { total: 3, taken: 2, pending: 1, free: 0 }, canManage: false, invitations: [] });
    }
    const own = await api.listInvitations(world.organizer, session.id);
    expect(own.body.canManage).toBe(true);
    expect(own.body.invitations.map((i) => i.email).sort()).toEqual([friend.email, 'p@int.local'].sort());
  });

  it('does not apply to an individual session', async () => {
    const world = await scenario();
    const res = await api.createIntent(world.organizer, world.booking());
    const tx = wompiCharges(res.body.intent);
    await api.confirm(world.organizer, tx);
    const session = await prisma.session.findFirst({ where: { tutorId: world.tutor.id } });

    expect(session).toMatchObject({ sessionType: 'Individual', maxCapacity: 1 });
    expect(await api.invite(world.organizer, session.id, 'a@int.local')).toMatchObject({ status: 409, body: { error: 'NOT_GROUP' } });
  });
});

// ─── What each person can see and do ──────────────────────────────────

describe('guests inside the session', () => {
  async function groupOfTwo() {
    const world = await scenario();
    const friend = await createUser({ name: 'Felipe Amigo' });
    const booked = await bookGroup(world, { groupSize: 2, inviteEmails: [friend.email] });
    await api.accept(friend, emailedToken(friend.email));
    await flushBackgroundWork();
    return { ...world, friend, ...booked };
  }

  it('shows the guest the session without the payment nor the organiser email', async () => {
    const { session, friend, organizer, tutor } = await groupOfTwo();

    const asGuest = (await api.session(friend, session.id)).body.session;
    expect(asGuest).toMatchObject({ isOrganizer: false, organizerId: organizer.id, googleMeetLink: MEET_LINK, payments: [] });
    expect(JSON.stringify(asGuest.participants)).not.toContain(organizer.email);

    const asOrganizer = (await api.session(organizer, session.id)).body.session;
    expect(asOrganizer.isOrganizer).toBe(true);
    expect(Number(asOrganizer.payments[0].amount)).toBe(50000);
    expect(JSON.stringify(asOrganizer.participants)).not.toContain(friend.email);

    // The tutor sees every student, with their email, organiser first.
    const asTutor = (await api.session(tutor, session.id)).body.session;
    expect(asTutor.participants.map((p) => p.student.email)).toEqual([organizer.email, friend.email]);
  });

  it('does not let a guest cancel the session for everyone', async () => {
    const { session, friend } = await groupOfTwo();

    const res = await api.cancel(friend, session.id, { reason: 'No puedo', refundMethod: 'nequi' });

    expect(res).toMatchObject({ status: 403, body: { code: 'GUEST_CANNOT_CANCEL' } });
    expect((await prisma.session.findUnique({ where: { id: session.id } })).status).toBe('Accepted');
    expect(calendar.cancelTutoringSessionEvent).not.toHaveBeenCalled();
  });

  it('lets a guest leave: the seat is free again and the session goes on', async () => {
    const { session, friend, organizer } = await groupOfTwo();

    expect((await api.leave(friend, session.id)).status).toBe(200);
    await flushBackgroundWork();

    expect(await participantIds(session.id)).toEqual([organizer.id]);
    expect((await prisma.session.findUnique({ where: { id: session.id } })).status).toBe('Accepted');
    expect(calendar.updateTutoringSessionAttendees).toHaveBeenLastCalledWith(EVENT_ID, { removeEmail: friend.email });
    expect(await prisma.review.count({ where: { sessionId: session.id, studentId: friend.id } })).toBe(0);
    expect((await api.session(friend, session.id)).status).toBe(403);
    // The payment is untouched and the organiser can fill the seat again — even with the same person.
    expect(await prisma.payment.count({ where: { sessionId: session.id, status: 'paid' } })).toBe(1);
    expect((await api.invite(organizer, session.id, friend.email)).status).toBe(201);
    expect((await api.accept(friend, emailedToken(friend.email))).status).toBe(200);
  });

  it('does not let whoever booked leave: they cancel instead', async () => {
    const { session, organizer } = await groupOfTwo();

    expect(await api.leave(organizer, session.id)).toMatchObject({ status: 409, body: { error: 'ORGANIZER_CANNOT_LEAVE' } });
    expect(await participantIds(session.id)).toHaveLength(2);
  });

  it('cancels for everyone when the organiser cancels, telling the guests', async () => {
    const { session, organizer, friend, tutor } = await groupOfTwo();

    const res = await api.cancel(organizer, session.id, { reason: 'Cambio de planes', refundMethod: 'nequi' });
    await flushBackgroundWork();

    expect(res.status).toBe(200);
    expect((await prisma.session.findUnique({ where: { id: session.id } })).status).toBe('Canceled');
    expect(calendar.cancelTutoringSessionEvent).toHaveBeenCalledWith(EVENT_ID);
    const notified = await prisma.notification.findMany({ where: { sessionId: session.id, type: 'session_cancelled' } });
    expect(notified.map((n) => n.userId).sort()).toEqual([tutor.id, friend.id].sort());
    const emailed = emailService.sendSessionCancellationToStudent.mock.calls.map(([to]) => to);
    expect(emailed.sort()).toEqual([organizer.email, friend.email].sort());
    // Only the organiser's email carries the refund method.
    const guestEmail = emailService.sendSessionCancellationToStudent.mock.calls.find(([to]) => to === friend.email);
    expect(guestEmail[4]).toBeNull();
  });

  it('closes a pending invitation with the session', async () => {
    const world = await scenario();
    const late = await createUser();
    const { session } = await bookGroup(world, { groupSize: 2, inviteEmails: ['tarde@int.local'] });
    const token = emailedToken('tarde@int.local');
    await api.cancel(world.organizer, session.id, { reason: 'Cambio de planes', refundMethod: 'nequi' });

    expect((await api.preview(null, token)).body.invitation.state).toBe('expired');
    expect(await api.accept(late, token)).toMatchObject({ status: 409, body: { error: 'SESSION_NOT_ACTIVE' } });
    expect(await participantIds(session.id)).toEqual([world.organizer.id]);
  });
});
