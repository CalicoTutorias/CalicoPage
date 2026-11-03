// Fixtures for the integration suite, written through the real Prisma client.
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { signToken } from '@/lib/auth/jwt';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const TUTOR_TIME_ZONE = 'America/Bogota';

/**
 * Request headers carrying a real JWT for `user`, signed like a login does.
 * `claims` override the signed payload (e.g. `{ role: 'ADMIN' }` to forge a
 * role the DB does not grant).
 */
export function authHeaders(user, claims = {}) {
  return { authorization: `Bearer ${signToken({ ...user, ...claims })}` };
}

/** An approved tutor with a Schedule row; omitted settings take the DB defaults. */
export async function createTutor({ schedule = {} } = {}) {
  const tutor = await createUser({ isTutorApproved: true });
  await prisma.schedule.create({ data: { userId: tutor.id, ...schedule } });
  return tutor;
}

/** A 1-hour individual session of `tutor` starting at `start`, with `student` as participant. */
export function createSession({ tutor, student, course, start, status = 'Accepted' }) {
  return prisma.session.create({
    data: {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      startTimestamp: start,
      endTimestamp: new Date(start.getTime() + HOUR_MS),
      status,
      locationType: 'Virtual',
      participants: { create: { studentId: student.id } },
    },
  });
}

export async function resetEventData() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE event_payments, event_survey_responses, event_registrations, event_tutor_payouts, ' +
      'event_tutors, events, reviews, payment_intents RESTART IDENTITY CASCADE',
  );
}

export async function createUser({ isTutorApproved = false, name, role = 'STUDENT' } = {}) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      email: `${id}@int.local`,
      name: name ?? `Int ${id.slice(0, 8)}`,
      role,
      isEmailVerified: true,
      isTutorApproved,
      ...(isTutorApproved ? { tutorProfile: { create: { schoolEmail: `${id}@uniandes.int.local` } } } : {}),
    },
  });
}

/** A course (with its own career, codes unique per call). */
export async function createCourse({ basePrice = 40000 } = {}) {
  const tag = randomUUID().slice(0, 8).toUpperCase();
  const career = await prisma.career.create({ data: { code: `I${tag}`, name: 'Integración' } });
  return prisma.course.create({
    data: { name: 'Int course', code: `I${tag}0001`, basePrice, complexity: 'Foundational', careerId: career.id },
  });
}

/**
 * A Published virtual event starting in 2 days, price 20000 with 5 early-bird
 * slots at 10 %, and `tutorCount` approved tutors attached.
 * @returns {{ event, tutors }}
 */
export async function createEvent(overrides = {}, { tutorCount = 1 } = {}) {
  const tutors = [];
  for (let i = 0; i < tutorCount; i += 1) {
    tutors.push(await createUser({ isTutorApproved: true, name: `Int Tutor ${i + 1}` }));
  }
  const startsAt = new Date(Date.now() + 48 * HOUR_MS);
  const event = await prisma.event.create({
    data: {
      slug: `int-${randomUUID().slice(0, 8)}`,
      title: 'Integration event',
      description: 'Integration test event',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * HOUR_MS),
      modality: 'Virtual',
      meetingUrl: 'https://meet.google.com/int-test',
      price: 20000,
      earlyBirdSlots: 5,
      earlyBirdPercent: 10,
      status: 'Published',
      publishedAt: new Date(),
      ...overrides,
      tutors: { create: tutors.map((t, position) => ({ tutorId: t.id, position })) },
    },
  });
  return { event, tutors };
}

/** The approved Wompi transaction for a checkout result. */
export function approvedTx(checkoutResult, id = `tx-${randomUUID()}`) {
  return {
    id,
    reference: checkoutResult.reference,
    amount_in_cents: checkoutResult.amountInCents,
    status: 'APPROVED',
  };
}

export function storedIntent(reference) {
  return prisma.paymentIntent.findUnique({ where: { reference } });
}

// ─── Session checkout ─────────────────────────────────────────────────

/** Everything a session checkout writes (cascades to participants, reviews…). */
export async function resetSessionData() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE sessions, payments, coupon_redemptions, coupons, payment_intents, notifications RESTART IDENTITY CASCADE',
  );
}

/** `Authorization` header value: a real JWT from the app's own signer. */
export function bearer(user) {
  return `Bearer ${signToken(user)}`;
}

/**
 * Approved tutor whose schedule is in `timeZone`, with a recurring
 * 08:00–18:00 availability block on every weekday, so any slot inside that
 * window is bookable on any date.
 */
export async function createTutorWithAvailability({ timeZone = TUTOR_TIME_ZONE } = {}) {
  const tutor = await createUser({ isTutorApproved: true, name: 'Int Tutor' });
  await prisma.schedule.create({ data: { userId: tutor.id, timezone: timeZone } });
  await prisma.availability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      userId: tutor.id,
      dayOfWeek,
      startTime: new Date('1970-01-01T08:00:00.000Z'),
      endTime: new Date('1970-01-01T18:00:00.000Z'),
    })),
  });
  return tutor;
}

/** UTC instant of the wall-clock `time` (HH:MM) on `isoDate` in `timeZone`. */
function zonedInstant(isoDate, time, timeZone) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const wallAtGuess = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess - (wallAtGuess - guess));
}

/**
 * A one-hour slot starting at `time` on the tutor's wall clock,
 * `daysFromToday` days from today in `timeZone` (negative = past).
 * @returns {{ startTimestamp: string, endTimestamp: string }}
 */
export function slotAt({ daysFromToday = 3, time = '10:00', timeZone = TUTOR_TIME_ZONE } = {}) {
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(Date.now() + daysFromToday * DAY_MS));
  const start = zonedInstant(isoDate, time, timeZone);
  return {
    startTimestamp: start.toISOString(),
    endTimestamp: new Date(start.getTime() + HOUR_MS).toISOString(),
  };
}

/** An active coupon: 10 % off, Calico absorbs the discount, 5 uses, 1 per user. */
export function createCoupon(overrides = {}) {
  return prisma.coupon.create({
    data: {
      code: `INT${randomUUID().slice(0, 8).toUpperCase()}`,
      discountType: 'PERCENT',
      discountValue: 10,
      absorber: 'CALICO',
      maxRedemptions: 5,
      perUserLimit: 1,
      ...overrides,
    },
  });
}
