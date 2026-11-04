/**
 * Admin "Tutorías" page (/home/admin/tutorias) queries on a real Postgres:
 *   - the sessions listing: case-insensitive search, Bogotá date range,
 *     missing Meet link, test-course exclusion, upcoming order
 *   - "Pagos sin tutoría": unconsumed intents with an APPROVED sweep or a
 *     pending transaction pinned more than 15 minutes ago; consumed ones out
 *   - the route's admin gate with real JWTs (role read from the DB)
 */
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { listSessions, listUnbookedPayments } from '@/lib/services/admin-sessions.service';
import { GET as getSessions } from '@/app/api/admin/sessions/route';
import { GET as getUnbooked } from '@/app/api/admin/payments/unbooked/route';
import { resetSessionData, resetEventData, createUser, createCourse, createSession, createEvent, authHeaders } from './helpers/factory';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

beforeEach(async () => {
  await resetSessionData();
  await resetEventData();
});
afterAll(() => prisma.$disconnect());

const ids = (page) => page.items.map((s) => s.id);

/** The shared test course (TEST123), created once per database. */
async function testCourse() {
  const existing = await prisma.course.findUnique({ where: { code: 'TEST123' } });
  if (existing) return existing;
  const career = await prisma.career.create({ data: { code: `T${randomUUID().slice(0, 8)}`, name: 'Pruebas' } });
  return prisma.course.create({
    data: { name: 'Curso de prueba', code: 'TEST123', basePrice: 1000, complexity: 'Foundational', careerId: career.id },
  });
}

async function people() {
  const tag = randomUUID().slice(0, 8);
  return {
    tag,
    tutor: await createUser({ isTutorApproved: true, name: `Tutor ${tag}` }),
    student: await createUser({ name: `Estudiante ${tag}` }),
    course: await createCourse(),
  };
}

describe('sessions listing', () => {
  it('test_should_search_student_tutor_and_course_case_insensitively', async () => {
    const { tag, tutor, student, course } = await people();
    const other = await people();
    const start = new Date(Date.now() + 2 * DAY_MS);
    const mine = await createSession({ tutor, student, course, start });
    await createSession({ tutor: other.tutor, student: other.student, course: other.course, start });

    const search = async (q) => ids(await listSessions({ search: q }));

    expect(await search(`ESTUDIANTE ${tag.toUpperCase()}`)).toEqual([mine.id]);   // student name
    expect(await search(student.email.slice(0, 8).toUpperCase())).toEqual([mine.id]); // student email
    expect(await search(`tutor ${tag}`)).toEqual([mine.id]);                         // tutor name
    expect(await search(tutor.email.slice(0, 8).toUpperCase())).toEqual([mine.id]);  // tutor email
    expect(await search(course.code.toLowerCase())).toEqual([mine.id]);              // course code
    expect(await search('zz-no-such-person')).toEqual([]);
  });

  it('test_should_filter_by_bogota_days_with_both_ends_inclusive', async () => {
    const { tutor, student, course } = await people();
    const at = (iso) => createSession({ tutor, student, course, start: new Date(iso) });
    const before = await at('2026-11-10T04:30:00.000Z');    // Nov 9, 23:30 Bogotá
    const firstDay = await at('2026-11-10T05:00:00.000Z');  // Nov 10, 00:00 Bogotá
    const lastDay = await at('2026-11-13T04:30:00.000Z');   // Nov 12, 23:30 Bogotá
    const after = await at('2026-11-13T05:00:00.000Z');     // Nov 13, 00:00 Bogotá

    const page = await listSessions({ from: '2026-11-10', to: '2026-11-12' });

    expect(ids(page)).toEqual([lastDay.id, firstDay.id]);
    expect(ids(page)).not.toContain(before.id);
    expect(ids(page)).not.toContain(after.id);
    expect(page.total).toBe(2);
  });

  it('test_should_list_only_accepted_sessions_without_meet_link_when_missing_meet', async () => {
    const { tutor, student, course } = await people();
    const start = new Date(Date.now() + DAY_MS);
    const noLink = await createSession({ tutor, student, course, start });
    const emptyLink = await createSession({ tutor, student, course, start: new Date(start.getTime() + HOUR_MS) });
    await prisma.session.update({ where: { id: emptyLink.id }, data: { googleMeetLink: '' } });
    const withLink = await createSession({ tutor, student, course, start: new Date(start.getTime() + 2 * HOUR_MS) });
    await prisma.session.update({ where: { id: withLink.id }, data: { googleMeetLink: 'https://meet.google.com/x' } });
    const pending = await createSession({ tutor, student, course, start, status: 'Pending' });

    const page = await listSessions({ missingMeet: true });

    expect(ids(page).sort()).toEqual([noLink.id, emptyLink.id].sort());
    expect(page.items.every((s) => s.missingMeet)).toBe(true);
    expect(ids(page)).not.toContain(pending.id);
    expect(ids(page)).not.toContain(withLink.id);
  });

  it('test_should_hide_test_course_sessions_unless_include_test', async () => {
    const { tutor, student, course } = await people();
    const start = new Date(Date.now() + DAY_MS);
    const real = await createSession({ tutor, student, course, start });
    const fake = await createSession({ tutor, student, course: await testCourse(), start: new Date(start.getTime() + HOUR_MS) });

    const counted = await listSessions({});
    const everything = await listSessions({ includeTest: true });

    expect(ids(counted)).toEqual([real.id]);
    expect(ids(everything)).toEqual([fake.id, real.id]);
    expect(everything.items.map((s) => s.isTest)).toEqual([true, false]);
  });

  it('test_should_list_upcoming_sessions_soonest_first', async () => {
    const { tutor, student, course } = await people();
    const now = Date.now();
    await createSession({ tutor, student, course, start: new Date(now - DAY_MS), status: 'Completed' });
    const later = await createSession({ tutor, student, course, start: new Date(now + 3 * DAY_MS) });
    const sooner = await createSession({ tutor, student, course, start: new Date(now + DAY_MS) });

    expect(ids(await listSessions({ upcoming: true }))).toEqual([sooner.id, later.id]);
    expect(ids(await listSessions({}))).toHaveLength(3);
  });
});

describe('payments without a booking', () => {
  const sweep = (status, outcome, extra = {}) => ({
    status, transactionId: `tx-${randomUUID()}`, outcome, reason: null, checkedAt: new Date().toISOString(), ...extra,
  });

  async function intent({ metadata, consumed = false, minutesAgo = 0, kind = 'session' }) {
    const reference = `INT-${randomUUID()}`;
    await prisma.paymentIntent.create({
      data: {
        reference,
        kind,
        metadata,
        consumedAt: consumed ? new Date() : null,
        createdAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
      },
    });
    return reference;
  }

  it('test_should_list_approved_sweeps_and_old_pending_transactions_but_not_consumed_or_fresh_ones', async () => {
    const { tutor, student, course } = await people();
    const booking = {
      studentId: student.id,
      tutorId: tutor.id,
      courseId: course.id,
      startTimestamp: '2026-11-20T15:00:00.000Z',
      endTimestamp: '2026-11-20T16:00:00.000Z',
      originalAmount: '40000',
      discountAmount: '0',
      tutorPayoutBase: '40000',
    };

    const approved = await intent({
      metadata: { ...booking, sweep: sweep('APPROVED', 'NEEDS_ATTENTION', { reason: 'SESSION_CONFLICT' }) },
      minutesAgo: 30,
    });
    const transient = await intent({ metadata: { ...booking, sweep: sweep('APPROVED', 'ERROR') }, minutesAgo: 1 });
    const oldPending = await intent({ metadata: { ...booking, pendingTransactionId: 'tx-pending-old' }, minutesAgo: 20 });
    const consumed = await intent({ metadata: { ...booking, sweep: sweep('APPROVED', 'FULFILLED') }, consumed: true, minutesAgo: 30 });
    const freshPending = await intent({ metadata: { ...booking, pendingTransactionId: 'tx-pending-new' }, minutesAgo: 5 });
    const consumedPending = await intent({ metadata: { ...booking, pendingTransactionId: 'tx-done' }, consumed: true, minutesAgo: 60 });
    const declined = await intent({ metadata: { ...booking, sweep: sweep('DECLINED', 'NOT_APPROVED') }, minutesAgo: 60 });
    const plain = await intent({ metadata: booking, minutesAgo: 60 });
    // The sweeper could not ask Wompi (status null): listed only through the pinned pending transaction.
    const unknownPending = await intent({
      metadata: { ...booking, pendingTransactionId: 'tx-pending-unknown', sweep: sweep(null, 'ERROR', { transactionId: null }) },
      minutesAgo: 40,
    });
    const unknownOnly = await intent({ metadata: { ...booking, sweep: sweep(null, 'ERROR', { transactionId: null }) }, minutesAgo: 40 });

    const items = await listUnbookedPayments();
    const refs = items.map((i) => i.reference);

    expect(refs).toEqual([transient, oldPending, approved, unknownPending]); // newest first
    for (const excluded of [consumed, freshPending, consumedPending, declined, plain, unknownOnly]) {
      expect(refs).not.toContain(excluded);
    }
    expect(items.find((i) => i.reference === unknownPending)).toMatchObject({
      transactionId: 'tx-pending-unknown',
      sweep: { status: null, outcome: 'ERROR' },
    });

    const row = items.find((i) => i.reference === approved);
    expect(row).toMatchObject({
      kind: 'session',
      student: { name: student.name, email: student.email },
      tutor: { name: tutor.name },
      course: { code: course.code, name: course.name },
      slotStart: '2026-11-20T15:00:00.000Z',
      amount: 40000,
      sweep: { status: 'APPROVED', outcome: 'NEEDS_ATTENTION', reason: 'SESSION_CONFLICT' },
    });
    expect(items.find((i) => i.reference === oldPending)).toMatchObject({ transactionId: 'tx-pending-old', sweep: null });
  });

  it('test_should_describe_an_event_intent_by_its_event', async () => {
    const student = await createUser({ name: 'Asistente repaso' });
    const { event } = await createEvent({ title: 'Repaso final' });
    const reference = await intent({
      kind: 'event',
      minutesAgo: 30,
      metadata: {
        kind: 'event', eventId: event.id, registrationId: randomUUID(), studentId: student.id,
        listPrice: '20000', discountAmount: '2000', finalAmount: '18000', earlyBird: true,
        sweep: sweep('APPROVED', 'NEEDS_ATTENTION', { reason: 'EVENT_REGISTRATION_MISSING' }),
      },
    });

    const [item] = await listUnbookedPayments();

    expect(item).toMatchObject({
      reference,
      kind: 'event',
      student: { name: 'Asistente repaso', email: student.email },
      event: { title: 'Repaso final' },
      tutor: null,
      course: null,
      slotStart: event.startsAt,
      amount: 18000,
    });
  });
});

describe('admin gate on the real routes', () => {
  const call = (handler, path, user) => handler(new Request(`http://localhost${path}`, { headers: authHeaders(user) }));

  it('test_should_reject_a_student_even_with_an_admin_claim_in_the_token', async () => {
    const student = await createUser();

    const forged = await getSessions(new Request('http://localhost/api/admin/sessions', {
      headers: authHeaders(student, { role: 'ADMIN' }),
    }));
    const unbooked = await call(getUnbooked, '/api/admin/payments/unbooked', student);

    expect(forged.status).toBe(403);
    expect(unbooked.status).toBe(403);
  });

  it('test_should_serve_a_db_admin', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const { tutor, student, course } = await people();
    const session = await createSession({ tutor, student, course, start: new Date(Date.now() + DAY_MS) });

    const res = await call(getSessions, `/api/admin/sessions?search=${encodeURIComponent(student.name)}`, admin);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, total: 1, items: [{ id: session.id, missingMeet: true }] });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|otpCode|resetToken|verificationToken|studentRating/);
  });
});
