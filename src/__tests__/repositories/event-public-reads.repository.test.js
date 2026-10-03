/**
 * @jest-environment node
 *
 * Query shapes of the event public reads (event.repository +
 * event-registration.repository): which events the public listing may ever
 * load, and that the public include never selects a tutor's email.
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    event: { findMany: jest.fn(), findUnique: jest.fn() },
    eventRegistration: { findUnique: jest.fn(), findMany: jest.fn() },
  },
}));

const prisma = require('@/lib/prisma').default;
const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');

const NOW = new Date('2026-10-03T15:00:00.000Z');

beforeEach(() => jest.clearAllMocks());

it('the public include selects the tutor rating but never the email', () => {
  const { select } = eventRepo.EVENT_PUBLIC_INCLUDE.tutors.include.tutor;
  expect(select).toEqual({
    id: true,
    name: true,
    profilePictureUrl: true,
    tutorProfile: { select: { review: true, numReview: true } },
  });
  expect(eventRepo.EVENT_PUBLIC_INCLUDE.tutors.orderBy).toEqual({ position: 'asc' });
});

it('findManyPublic: Published, listed, not ended, soonest first, limited', async () => {
  prisma.event.findMany.mockResolvedValue([]);

  await eventRepo.findManyPublic({ now: NOW, take: 50 });

  expect(prisma.event.findMany).toHaveBeenCalledWith({
    where: { status: 'Published', isListed: true, endsAt: { gt: NOW } },
    orderBy: { startsAt: 'asc' },
    take: 50,
    include: eventRepo.EVENT_PUBLIC_INCLUDE,
  });
});

it('findPublicBySlug: by slug with the public include; no query without a slug', async () => {
  await eventRepo.findPublicBySlug('repaso-x');
  expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { slug: 'repaso-x' }, include: eventRepo.EVENT_PUBLIC_INCLUDE });

  await expect(eventRepo.findPublicBySlug('')).resolves.toBeNull();
  expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
});

it('findManyForTutor: Published and Canceled events the user tutors', async () => {
  await eventRepo.findManyForTutor('t1');

  expect(prisma.event.findMany).toHaveBeenCalledWith({
    where: { status: { in: ['Published', 'Canceled'] }, tutors: { some: { tutorId: 't1' } } },
    orderBy: { startsAt: 'asc' },
    include: eventRepo.EVENT_PUBLIC_INCLUDE,
  });
});

it('findViewerRegistration: the (event, user) row with the survey presence only', async () => {
  await regRepo.findViewerRegistration('e1', 'u1');

  expect(prisma.eventRegistration.findUnique).toHaveBeenCalledWith({
    where: { eventId_userId: { eventId: 'e1', userId: 'u1' } },
    include: { surveyResponse: { select: { id: true } } },
  });
});

it('findUserRegistrations: Confirmed and Canceled rows with the public event', async () => {
  await regRepo.findUserRegistrations('u1');

  expect(prisma.eventRegistration.findMany).toHaveBeenCalledWith({
    where: { userId: 'u1', status: { in: ['Confirmed', 'Canceled'] } },
    orderBy: { event: { startsAt: 'asc' } },
    include: { event: { include: eventRepo.EVENT_PUBLIC_INCLUDE }, surveyResponse: { select: { id: true } } },
  });
});
