/**
 * Approval events and study material against a real Postgres: a request is
 * PendingApproval (never Wompi), the admin approval / rejection and the
 * student's own withdrawal serialise on the event row lock, and the material
 * unlocks only for a Confirmed registrant who answered the survey.
 */
import prisma from '@/lib/prisma';
import { registerFree, startCheckout, cancelRegistration } from '@/lib/services/event-checkout.service';
import { reviewRegistration } from '@/lib/services/event-admin.service';
import { submitSurvey } from '@/lib/services/event-survey.service';
import { getPublicEvent } from '@/lib/services/event.service';
import { listMaterialsForStudent } from '@/lib/services/event-material.service';
import * as eventRepo from '@/lib/repositories/event.repository';
import { getSurveyResultsAdmin } from '@/lib/services/event-admin.service';
import { resetEventData, createUser, createEvent } from './helpers/factory';

const HOUR_MS = 3_600_000;
const APPROVAL = { requiresApproval: true, price: 25000, earlyBirdSlots: null, earlyBirdPercent: null };

async function setup() {
  const { event, tutors } = await createEvent(APPROVAL);
  const [student, admin] = await Promise.all([
    createUser({ phoneNumber: `+57 300${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` }),
    createUser({ role: 'ADMIN' }),
  ]);
  return { event, tutors, student, admin };
}

const registrationOf = (event, student) =>
  prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId: event.id, userId: student.id } } });

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('approval events (real Postgres)', () => {
  it('a request is PendingApproval at the informative price, counted as awaiting approval, and never a checkout', async () => {
    const { event, student } = await setup();

    const settled = await Promise.all([
      registerFree({ slug: event.slug, userId: student.id, source: 'afiche' }),
      registerFree({ slug: event.slug, userId: student.id, source: 'afiche' }),
    ]);

    expect(settled.map((r) => r.status)).toEqual(['PendingApproval', 'PendingApproval']);
    expect(await prisma.eventRegistration.count({ where: { eventId: event.id } })).toBe(1);
    const row = await registrationOf(event, student);
    expect(Number(row.finalAmount)).toBe(25000);
    expect(row.source).toBe('afiche');
    expect((await eventRepo.adminStatsByEvent([event.id])).get(event.id)).toMatchObject({ confirmed: 0, awaitingApproval: 1 });

    await expect(startCheckout({ slug: event.slug, userId: student.id })).rejects.toMatchObject({ code: 'EVENT_REQUIRES_APPROVAL' });
    expect(await prisma.paymentIntent.count()).toBe(0);

    const { myRegistration } = await getPublicEvent({ slug: event.slug, viewerId: student.id });
    expect(myRegistration).toMatchObject({ status: 'PendingApproval', meetingUrl: null, canCancel: true, refundable: false });
  });

  it('a student without a phone cannot request a spot (PHONE_REQUIRED) and no row is written', async () => {
    const { event } = await setup();
    const noPhone = await createUser();

    await expect(registerFree({ slug: event.slug, userId: noPhone.id })).rejects.toMatchObject({ code: 'PHONE_REQUIRED' });
    expect(await prisma.eventRegistration.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('approve → Confirmed with the link; a second approve is INVALID_STATE; reject → Rejected and the request stays rejected', async () => {
    const { event, student, admin } = await setup();
    const { id: registrationId } = await registerFree({ slug: event.slug, userId: student.id });

    const approved = await reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'approve' });
    expect(approved.registration.status).toBe('Confirmed');
    expect((await registrationOf(event, student)).reviewedById).toBe(admin.id);
    const view = await getPublicEvent({ slug: event.slug, viewerId: student.id });
    expect(view.myRegistration).toMatchObject({ status: 'Confirmed', meetingUrl: 'https://meet.google.com/int-test' });

    await expect(reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'approve' }))
      .rejects.toMatchObject({ code: 'INVALID_STATE' });

    await reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'reject' });
    expect((await registrationOf(event, student)).status).toBe('Rejected');
    await expect(registerFree({ slug: event.slug, userId: student.id })).rejects.toMatchObject({ code: 'REGISTRATION_REJECTED' });
    expect(await prisma.adminAuditLog.count({ where: { targetId: registrationId } })).toBe(2);
  });

  it('an approval racing the student withdrawal: exactly one wins and the row matches it (event lock)', async () => {
    const { event, student, admin } = await setup();
    const { id: registrationId } = await registerFree({ slug: event.slug, userId: student.id });

    const [approve, cancel] = await Promise.allSettled([
      reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'approve' }),
      cancelRegistration({ slug: event.slug, userId: student.id }),
    ]);

    // Approval first → the withdrawal now cancels a paid, Confirmed row, which
    // asks for refund details. Withdrawal first → there is nothing to approve.
    const final = (await registrationOf(event, student)).status;
    if (approve.status === 'fulfilled') {
      expect(cancel.status).toBe('rejected');
      expect(cancel.reason.code).toBe('REFUND_DETAILS_REQUIRED');
      expect(final).toBe('Confirmed');
    } else {
      expect(approve.reason.code).toBe('INVALID_STATE');
      expect(cancel.status).toBe('fulfilled');
      expect(final).toBe('Canceled');
    }
  });
});

describe('study material (real Postgres)', () => {
  it('locked until Confirmed + survey; the page shows the count, then the list', async () => {
    const { event, tutors, student, admin } = await setup();
    const { id: registrationId } = await registerFree({ slug: event.slug, userId: student.id });
    await prisma.eventMaterial.create({
      data: { eventId: event.id, s3Key: `event-materials/sin-materia/2026-11-05_${event.slug}/guia-a1b2c3.pdf`, fileName: 'Guía.pdf', mimeType: 'application/pdf', fileSize: 1234 },
    });

    await expect(listMaterialsForStudent({ slug: event.slug, userId: student.id })).rejects.toMatchObject({ code: 'MATERIALS_LOCKED' });

    await reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'approve' });
    // The repaso took place: move it to the past so the survey opens.
    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() - 3 * HOUR_MS), endsAt: new Date(Date.now() - HOUR_MS) },
    });
    const locked = await getPublicEvent({ slug: event.slug, viewerId: student.id });
    expect(locked.myRegistration).toMatchObject({ surveyStatus: 'pending', materials: { count: 1, unlocked: false } });
    await expect(listMaterialsForStudent({ slug: event.slug, userId: student.id })).rejects.toMatchObject({ code: 'MATERIALS_LOCKED' });

    await submitSurvey({
      slug: event.slug, userId: student.id, attended: true, eventRating: 5,
      heardFrom: 'other', heardFromDetail: 'Afiche en el ML', wouldRecommend: 'maybe',
      tutorRatings: tutors.map((t) => ({ tutorId: t.id, rating: 5 })),
    });

    const results = await getSurveyResultsAdmin(event.id);
    expect(results.heardFrom.find((r) => r.value === 'other').count).toBe(1);
    expect(results.heardFromOther).toEqual(['Afiche en el ML']);
    expect(results.recommend).toEqual([{ value: 'yes', count: 0 }, { value: 'maybe', count: 1 }, { value: 'no', count: 0 }]);

    const unlocked = await getPublicEvent({ slug: event.slug, viewerId: student.id });
    expect(unlocked.myRegistration.materials).toEqual({ count: 1, unlocked: true });
    const files = await listMaterialsForStudent({ slug: event.slug, userId: student.id });
    expect(files).toEqual([expect.objectContaining({ fileName: 'Guía.pdf', fileSize: 1234 })]);
    expect(files[0]).not.toHaveProperty('s3Key');

    await reviewRegistration({ adminId: admin.id, eventId: event.id, registrationId, decision: 'reject' });
    await expect(listMaterialsForStudent({ slug: event.slug, userId: student.id })).rejects.toMatchObject({ code: 'MATERIALS_LOCKED' });
  });
});
