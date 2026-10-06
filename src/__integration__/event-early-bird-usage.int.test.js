/**
 * Early-bird usage reads against a real Postgres:
 *  - reserved_at is `timestamp without time zone` holding UTC wall time, so
 *    the hold window must compare it with UTC "now" whatever the session
 *    TimeZone is (RDS and the local docker default to UTC, but nothing
 *    enforces it). SET LOCAL pins the zone for one transaction.
 *  - the public event page quotes the viewer like checkout does: their own
 *    fresh hold does not use up the slot they are about to pay for.
 */
import prisma from '@/lib/prisma';
import { countEarlyBirdUsage } from '@/lib/repositories/event-registration.repository';
import { getPublicEvent } from '@/lib/services/event.service';
import { EVENT_HOLD_MINUTES } from '@/lib/payments/event-pricing';
import { resetEventData, createUser, createEvent } from './helpers/factory';

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

async function earlyBirdHold(eventId, reservedAt) {
  const user = await createUser();
  await prisma.eventRegistration.create({
    data: {
      eventId,
      userId: user.id,
      status: 'PendingPayment',
      earlyBird: true,
      reservedAt,
      listPrice: 20000,
      discountAmount: 2000,
      finalAmount: 18000,
    },
  });
  return user;
}

beforeEach(resetEventData);
afterAll(() => prisma.$disconnect());

describe('early-bird hold window vs the session TimeZone (real Postgres)', () => {
  it.each(['UTC', 'America/Bogota', 'Asia/Tokyo'])('with TimeZone %s counts the fresh hold and not the expired one', async (zone) => {
    const { event } = await createEvent();
    await earlyBirdHold(event.id, minutesAgo(5));
    await earlyBirdHold(event.id, minutesAgo(EVENT_HOLD_MINUTES + 1));
    const viewer = await createUser();

    const usage = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
      return countEarlyBirdUsage(tx, { eventId: event.id, excludeUserId: viewer.id, holdMinutes: EVENT_HOLD_MINUTES });
    });

    expect(usage).toBe(1);
  });
});

describe('getPublicEvent early-bird quote per viewer (real Postgres)', () => {
  it('the holder of the only slot sees the discount; another viewer and anonymous see none left', async () => {
    const { event } = await createEvent({ earlyBirdSlots: 1 });
    const holder = await earlyBirdHold(event.id, minutesAgo(5));
    const other = await createUser();

    const forHolder = await getPublicEvent({ slug: event.slug, viewerId: holder.id });
    const forOther = await getPublicEvent({ slug: event.slug, viewerId: other.id });
    const anonymous = await getPublicEvent({ slug: event.slug });

    expect(forHolder.event.earlyBird).toEqual({ slots: 1, percent: 10, remaining: 1, discountedPrice: 18000 });
    expect(forHolder.myRegistration.status).toBe('PendingPayment');
    expect(forOther.event.earlyBird.remaining).toBe(0);
    expect(anonymous.event.earlyBird.remaining).toBe(0);
  });
});
