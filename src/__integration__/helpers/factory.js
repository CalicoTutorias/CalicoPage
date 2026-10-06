// Fixtures for the integration suite, written through the real Prisma client.
import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';

const HOUR_MS = 3_600_000;

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
