/**
 * Post-event survey against a real Postgres: two tabs submitting at once
 * produce one response (unique registrationId → SURVEY_ALREADY_SUBMITTED)
 * and one review per tutor, and the review feeds the tutor's public rating.
 */
import prisma from '@/lib/prisma';
import { registerFree } from '@/lib/services/event-checkout.service';
import { submitSurvey } from '@/lib/services/event-survey.service';
import { resetEventData, createUser, createEvent } from './helpers/factory';

const HOUR_MS = 3_600_000;

/** A free event that ended an hour ago, with one Confirmed registrant. */
async function endedEventWithAttendee({ tutorCount }) {
  const startsAt = new Date(Date.now() - 3 * HOUR_MS);
  const { event, tutors } = await createEvent(
    { price: 0, earlyBirdSlots: null, earlyBirdPercent: null, startsAt, endsAt: new Date(Date.now() - HOUR_MS) },
    { tutorCount },
  );
  const student = await createUser();
  await registerFree({ slug: event.slug, userId: student.id, now: new Date(startsAt.getTime() - 24 * HOUR_MS) });
  return { event, tutors, student };
}

const surveyBody = (event, student, tutors, rating) => ({
  slug: event.slug,
  userId: student.id,
  attended: true,
  eventRating: 5,
  tutorRatings: tutors.map((t) => ({ tutorId: t.id, rating })),
});

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('event survey (real Postgres)', () => {
  it('two tabs submit the survey → one response, one review per tutor, the other SURVEY_ALREADY_SUBMITTED', async () => {
    const { event, tutors, student } = await endedEventWithAttendee({ tutorCount: 2 });
    const body = surveyBody(event, student, tutors, 4);

    const settled = await Promise.allSettled([submitSurvey(body), submitSurvey(body)]);

    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value.reviewsCreated).toBe(tutors.length);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.code).toBe('SURVEY_ALREADY_SUBMITTED');
    expect(await prisma.eventSurveyResponse.count({ where: { registration: { eventId: event.id } } })).toBe(1);
    expect(await prisma.review.count({ where: { eventId: event.id } })).toBe(tutors.length);
  });

  it("the survey's rating counts in the tutor's public rating", async () => {
    const { event, tutors, student } = await endedEventWithAttendee({ tutorCount: 1 });
    const before = await prisma.tutorProfile.findUnique({ where: { userId: tutors[0].id } });

    await submitSurvey(surveyBody(event, student, tutors, 4));

    const after = await prisma.tutorProfile.findUnique({ where: { userId: tutors[0].id } });
    expect(after.numReview).toBe(before.numReview + 1);
    expect(Number(after.review)).toBe(4);
  });
});
