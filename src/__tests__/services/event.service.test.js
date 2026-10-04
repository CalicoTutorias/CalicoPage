/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/event.service.js: the public reads
 * (listing, detail page, OG metadata), "my events" and the tutor list.
 * The one secret is meetingUrl: only a Confirmed registrant of a
 * non-canceled event and the event's tutors may ever see it.
 * Repositories and isAdmin are mocked; event-pricing is REAL.
 */

jest.mock('@/lib/repositories/event.repository', () => ({
  findManyPublic: jest.fn(),
  findPublicBySlug: jest.fn(),
  findManyForTutor: jest.fn(),
  adminStatsByEvent: jest.fn(),
}));
jest.mock('@/lib/repositories/event-registration.repository', () => ({
  earlyBirdUsageByEvent: jest.fn(),
  countEarlyBirdUsage: jest.fn(),
  findViewerRegistration: jest.fn(),
  findUserRegistrations: jest.fn(),
}));
jest.mock('@/lib/auth/guards', () => ({ isAdmin: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { client: 'prisma' } }));

const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const { isAdmin } = require('@/lib/auth/guards');
const prisma = require('@/lib/prisma').default;
const service = require('@/lib/services/event.service');

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-03T15:00:00.000Z');
const START = new Date(NOW.getTime() + 48 * HOUR);
const END = new Date(START.getTime() + 2 * HOUR);
const MEET = 'https://meet.google.com/abc-defg-hij';

/** Prisma row as read with EVENT_PUBLIC_INCLUDE. */
function stored(overrides = {}) {
  return {
    id: 'e1',
    slug: 'repaso-x',
    title: 'Repaso X',
    description: 'Repaso del primer parcial',
    coverImageUrl: 'https://cdn.example.com/event-images/x.png',
    courseId: 'c1',
    startsAt: START,
    endsAt: END,
    modality: 'Virtual',
    autoMeet: true,
    meetingUrl: MEET,
    location: null,
    googleCalendarEventId: 'gcal-secret-123',
    price: '20000.00',
    earlyBirdSlots: 5,
    earlyBirdPercent: 10,
    isListed: true,
    status: 'Published',
    createdById: 'admin-1',
    course: { id: 'c1', name: 'Cálculo', code: 'MATE1203' },
    tutors: [
      {
        eventId: 'e1',
        tutorId: 't1',
        position: 0,
        tutor: { id: 't1', name: 'Tutor Uno', profilePictureUrl: null, tutorProfile: { review: '4.50', numReview: 12 } },
      },
    ],
    ...overrides,
  };
}

function registration(overrides = {}) {
  return {
    id: 'r1',
    eventId: 'e1',
    userId: 'u1',
    status: 'Confirmed',
    earlyBird: true,
    listPrice: '20000.00',
    discountAmount: '2000.00',
    finalAmount: '18000.00',
    confirmedAt: new Date(NOW.getTime() - HOUR),
    refundMethodDetails: 'secret-account',
    surveyResponse: null,
    ...overrides,
  };
}

const notFound = expect.objectContaining({ code: 'EVENT_NOT_FOUND' });

beforeEach(() => {
  jest.clearAllMocks();
  regRepo.earlyBirdUsageByEvent.mockResolvedValue(new Map());
  isAdmin.mockResolvedValue(false);
});

// ─── listPublicEvents ────────────────────────────────────────────────────

describe('listPublicEvents', () => {
  it('asks the repository for the public slice (limit 50) and returns the exact public shape', async () => {
    eventRepo.findManyPublic.mockResolvedValue([stored()]);
    regRepo.earlyBirdUsageByEvent.mockResolvedValue(new Map([['e1', 3]]));

    const result = await service.listPublicEvents({ now: NOW });

    expect(eventRepo.findManyPublic).toHaveBeenCalledWith({ now: NOW, take: 50 });
    expect(regRepo.earlyBirdUsageByEvent).toHaveBeenCalledWith(['e1'], 30);
    expect(result).toEqual([
      {
        id: 'e1',
        slug: 'repaso-x',
        title: 'Repaso X',
        description: 'Repaso del primer parcial',
        coverImageUrl: 'https://cdn.example.com/event-images/x.png',
        startsAt: START,
        endsAt: END,
        modality: 'Virtual',
        location: null,
        price: 20000,
        earlyBird: { slots: 5, percent: 10, remaining: 2, discountedPrice: 18000 },
        status: 'Published',
        isListed: true,
        registrationOpen: true,
        hasEnded: false,
        course: { id: 'c1', name: 'Cálculo', code: 'MATE1203' },
        tutors: [{ id: 't1', name: 'Tutor Uno', profilePictureUrl: null, rating: 4.5, numReview: 12 }],
      },
    ]);
  });

  it('never leaks meetingUrl or the calendar id', async () => {
    eventRepo.findManyPublic.mockResolvedValue([stored(), stored({ id: 'e2', slug: 'otro' })]);

    const result = await service.listPublicEvents({ now: NOW });

    const json = JSON.stringify(result);
    expect(json.includes('meet.google')).toBe(false);
    expect(json.includes('gcal-secret-123')).toBe(false);
    for (const item of result) {
      expect(item).not.toHaveProperty('meetingUrl');
      expect(item).not.toHaveProperty('googleCalendarEventId');
    }
  });

  it('clamps remaining at 0 and has no early-bird block (nor count) for events without one', async () => {
    eventRepo.findManyPublic.mockResolvedValue([
      stored(),
      stored({ id: 'e2', earlyBirdSlots: null, earlyBirdPercent: null }),
      stored({ id: 'e3', price: '0.00', earlyBirdSlots: null, earlyBirdPercent: null }),
    ]);
    regRepo.earlyBirdUsageByEvent.mockResolvedValue(new Map([['e1', 7]]));

    const [withEb, withoutEb, free] = await service.listPublicEvents({ now: NOW });

    expect(regRepo.earlyBirdUsageByEvent).toHaveBeenCalledWith(['e1'], 30);
    expect(withEb.earlyBird).toEqual({ slots: 5, percent: 10, remaining: 0, discountedPrice: 18000 });
    expect(withoutEb.earlyBird).toBeNull();
    expect(free).toMatchObject({ price: 0, earlyBird: null });
  });

  it('shows the location only for in-person events', async () => {
    eventRepo.findManyPublic.mockResolvedValue([
      stored({ modality: 'InPerson', location: 'ML-603', meetingUrl: null }),
      stored({ id: 'e2', location: 'should not show' }),
    ]);

    const [inPerson, virtual] = await service.listPublicEvents({ now: NOW });

    expect(inPerson.location).toBe('ML-603');
    expect(virtual.location).toBeNull();
  });
});

// ─── getPublicEvent ──────────────────────────────────────────────────────

describe('getPublicEvent', () => {
  beforeEach(() => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored());
    regRepo.findViewerRegistration.mockResolvedValue(registration());
  });

  it('404s unknown slugs', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(null);
    await expect(service.getPublicEvent({ slug: 'nope', viewerId: null, now: NOW })).rejects.toEqual(notFound);
  });

  it('404s a Draft for anonymous viewers and non-admins; admins preview it', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored({ status: 'Draft' }));

    await expect(service.getPublicEvent({ slug: 'repaso-x', viewerId: null, now: NOW })).rejects.toEqual(notFound);
    expect(isAdmin).not.toHaveBeenCalled();

    await expect(service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u1', now: NOW })).rejects.toEqual(notFound);
    expect(isAdmin).toHaveBeenCalledWith('u1');

    isAdmin.mockResolvedValue(true);
    const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'admin-1', now: NOW });
    expect(event.status).toBe('Draft');
    expect(event.registrationOpen).toBe(false);
  });

  it('returns a hidden (isListed=false) published event by slug', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored({ isListed: false }));

    const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: null, now: NOW });

    expect(event).toMatchObject({ id: 'e1', isListed: false, registrationOpen: true });
    expect(eventRepo.findPublicBySlug).toHaveBeenCalledWith('repaso-x');
  });

  it('anonymous viewers get no myRegistration and no secret anywhere', async () => {
    const result = await service.getPublicEvent({ slug: 'repaso-x', viewerId: null, now: NOW });

    expect(result.myRegistration).toBeNull();
    expect(regRepo.findViewerRegistration).not.toHaveBeenCalled();
    expect(JSON.stringify(result).includes('meet.google')).toBe(false);
  });

  it('a Confirmed registrant gets the meeting link and the exact registration shape', async () => {
    const result = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u1', now: NOW });

    expect(regRepo.findViewerRegistration).toHaveBeenCalledWith('e1', 'u1');
    expect(result.event).not.toHaveProperty('meetingUrl');
    expect(result.myRegistration).toEqual({
      status: 'Confirmed',
      earlyBird: true,
      finalAmount: 18000,
      confirmedAt: new Date(NOW.getTime() - HOUR),
      canCancel: true,
      refundable: true,
      surveyStatus: 'none',
      meetingUrl: MEET,
    });
  });

  describe('early-bird quote for the viewer (same rule as checkout: their own row is not counted)', () => {
    // One slot, held by `holder` with a fresh PendingPayment early-bird row.
    beforeEach(() => {
      eventRepo.findPublicBySlug.mockResolvedValue(stored({ earlyBirdSlots: 1 }));
      regRepo.earlyBirdUsageByEvent.mockResolvedValue(new Map([['e1', 1]]));
      regRepo.countEarlyBirdUsage.mockImplementation(async (_tx, { excludeUserId }) => (excludeUserId === 'holder' ? 0 : 1));
    });

    it('the holder of a fresh hold still sees the slot and the discounted price checkout will charge', async () => {
      regRepo.findViewerRegistration.mockResolvedValue(registration({ userId: 'holder', status: 'PendingPayment' }));

      const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'holder', now: NOW });

      expect(regRepo.countEarlyBirdUsage).toHaveBeenCalledWith(prisma, { eventId: 'e1', excludeUserId: 'holder', holdMinutes: 30 });
      expect(regRepo.earlyBirdUsageByEvent).not.toHaveBeenCalled();
      expect(event.earlyBird).toEqual({ slots: 1, percent: 10, remaining: 1, discountedPrice: 18000 });
    });

    it('another logged-in viewer sees no slot left', async () => {
      regRepo.findViewerRegistration.mockResolvedValue(null);

      const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u2', now: NOW });

      expect(regRepo.countEarlyBirdUsage).toHaveBeenCalledWith(prisma, { eventId: 'e1', excludeUserId: 'u2', holdMinutes: 30 });
      expect(event.earlyBird.remaining).toBe(0);
    });

    it('anonymous viewers keep the batch count (no viewer to exclude)', async () => {
      const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: null, now: NOW });

      expect(regRepo.earlyBirdUsageByEvent).toHaveBeenCalledWith(['e1'], 30);
      expect(regRepo.countEarlyBirdUsage).not.toHaveBeenCalled();
      expect(event.earlyBird.remaining).toBe(0);
    });

    it('an event without early-bird runs no count for a viewer', async () => {
      eventRepo.findPublicBySlug.mockResolvedValue(stored({ earlyBirdSlots: null, earlyBirdPercent: null }));

      const { event } = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u2', now: NOW });

      expect(regRepo.countEarlyBirdUsage).not.toHaveBeenCalled();
      expect(event.earlyBird).toBeNull();
    });
  });

  it.each([
    ['PendingPayment registration', { status: 'PendingPayment' }, {}],
    ['Canceled registration', { status: 'Canceled' }, {}],
    ['Confirmed on a Canceled event', {}, { status: 'Canceled' }],
  ])('%s → meetingUrl null and nothing leaks', async (_label, regOverrides, eventOverrides) => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored(eventOverrides));
    regRepo.findViewerRegistration.mockResolvedValue(registration(regOverrides));

    const result = await service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u1', now: NOW });

    expect(result.myRegistration.meetingUrl).toBeNull();
    expect(result.myRegistration.canCancel).toBe(false);
    expect(JSON.stringify(result).includes('meet.google')).toBe(false);
  });

  describe('field rules around 6 h, the start and the end', () => {
    const view = async (now, regOverrides = {}, eventOverrides = {}) => {
      eventRepo.findPublicBySlug.mockResolvedValue(stored(eventOverrides));
      regRepo.findViewerRegistration.mockResolvedValue(registration(regOverrides));
      return service.getPublicEvent({ slug: 'repaso-x', viewerId: 'u1', now });
    };

    it('exactly 6 h before start: cancellable and refundable', async () => {
      const { myRegistration } = await view(new Date(START.getTime() - 6 * HOUR));
      expect(myRegistration).toMatchObject({ canCancel: true, refundable: true });
    });

    it('5 h 59 min before start: cancellable, not refundable', async () => {
      const { myRegistration } = await view(new Date(START.getTime() - 6 * HOUR + MIN));
      expect(myRegistration).toMatchObject({ canCancel: true, refundable: false });
    });

    it('free registration: cancellable, never refundable', async () => {
      const { myRegistration } = await view(NOW, { finalAmount: '0.00', earlyBird: false });
      expect(myRegistration).toMatchObject({ canCancel: true, refundable: false, finalAmount: 0 });
    });

    it('at the start: closed, not cancellable, survey not yet open', async () => {
      const { event, myRegistration } = await view(START);
      expect(event).toMatchObject({ registrationOpen: false, hasEnded: false });
      expect(myRegistration).toMatchObject({ canCancel: false, refundable: false, surveyStatus: 'none' });
    });

    it('just before the end: survey still none', async () => {
      const { myRegistration } = await view(new Date(END.getTime() - 1));
      expect(myRegistration.surveyStatus).toBe('none');
    });

    it('at the end: pending without a response, submitted with one', async () => {
      const pending = await view(END);
      expect(pending.event.hasEnded).toBe(true);
      expect(pending.myRegistration.surveyStatus).toBe('pending');

      const submitted = await view(END, { surveyResponse: { id: 's1' } });
      expect(submitted.myRegistration.surveyStatus).toBe('submitted');
    });

    it('ended but not Confirmed: survey none', async () => {
      const { myRegistration } = await view(END, { status: 'PendingPayment' });
      expect(myRegistration.surveyStatus).toBe('none');
    });
  });
});

// ─── getMyEvents ─────────────────────────────────────────────────────────

describe('getMyEvents', () => {
  it('returns Confirmed and Canceled rows with the event summary; the link only for Confirmed on live events', async () => {
    regRepo.findUserRegistrations.mockResolvedValue([
      { ...registration({ id: 'r1' }), event: stored() },
      { ...registration({ id: 'r2', status: 'Canceled' }), event: stored({ id: 'e2', slug: 'b' }) },
      { ...registration({ id: 'r3' }), event: stored({ id: 'e3', slug: 'c', status: 'Canceled' }) },
    ]);

    const result = await service.getMyEvents('u1', NOW);

    expect(regRepo.findUserRegistrations).toHaveBeenCalledWith('u1');
    expect(result.map((r) => [r.id, r.status, r.meetingUrl])).toEqual([
      ['r1', 'Confirmed', MEET],
      ['r2', 'Canceled', null],
      ['r3', 'Confirmed', null],
    ]);
    expect(result[0]).toMatchObject({ canCancel: true, refundable: true, surveyStatus: 'none', finalAmount: 18000 });
    expect(result[0].event).toMatchObject({ id: 'e1', slug: 'repaso-x', title: 'Repaso X', registrationOpen: true });
    for (const r of result) {
      expect(r.event).not.toHaveProperty('meetingUrl');
      expect(r).not.toHaveProperty('refundMethodDetails');
    }
  });
});

// ─── getTutorEvents ──────────────────────────────────────────────────────

describe('getTutorEvents', () => {
  it('returns the tutor\'s Published and Canceled events with confirmedCount and the meeting link', async () => {
    eventRepo.findManyForTutor.mockResolvedValue([stored(), stored({ id: 'e2', slug: 'b', status: 'Canceled' })]);
    eventRepo.adminStatsByEvent.mockResolvedValue(new Map([
      ['e1', { confirmed: 7, pending: 1, canceled: 0, responses: 0 }],
      ['e2', { confirmed: 0, pending: 0, canceled: 3, responses: 0 }],
    ]));

    const result = await service.getTutorEvents('t1', NOW);

    expect(eventRepo.findManyForTutor).toHaveBeenCalledWith('t1');
    expect(eventRepo.adminStatsByEvent).toHaveBeenCalledWith(['e1', 'e2']);
    expect(result.map((e) => [e.id, e.status, e.confirmedCount, e.meetingUrl])).toEqual([
      ['e1', 'Published', 7, MEET],
      ['e2', 'Canceled', 0, MEET],
    ]);
    expect(result[0]).toMatchObject({ slug: 'repaso-x', registrationOpen: true, hasEnded: false });
    expect(result[0]).not.toHaveProperty('googleCalendarEventId');
  });
});

// ─── getEventMetaForPage ─────────────────────────────────────────────────

describe('getEventMetaForPage', () => {
  it('returns null for unknown and Draft slugs', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(null);
    await expect(service.getEventMetaForPage('nope')).resolves.toBeNull();
    eventRepo.findPublicBySlug.mockResolvedValue(stored({ status: 'Draft' }));
    await expect(service.getEventMetaForPage('repaso-x')).resolves.toBeNull();
  });

  it('returns title, cover and the description truncated to 160 chars', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored({ description: 'x'.repeat(300), status: 'Canceled' }));

    const meta = await service.getEventMetaForPage('repaso-x');

    expect(meta.title).toBe('Repaso X');
    expect(meta.coverImageUrl).toBe('https://cdn.example.com/event-images/x.png');
    expect(meta.description).toHaveLength(160);
    expect(meta.description.endsWith('…')).toBe(true);
    expect(Object.keys(meta).sort()).toEqual(['coverImageUrl', 'description', 'title']);
  });

  it('keeps a short description as is', async () => {
    eventRepo.findPublicBySlug.mockResolvedValue(stored());
    await expect(service.getEventMetaForPage('repaso-x')).resolves.toEqual({
      title: 'Repaso X',
      description: 'Repaso del primer parcial',
      coverImageUrl: 'https://cdn.example.com/event-images/x.png',
    });
  });
});
