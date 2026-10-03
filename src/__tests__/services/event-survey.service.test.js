/**
 * @jest-environment node
 *
 * Unit tests for src/lib/services/event-survey.service.js (spec §6, §7
 * actions): the post-event survey that feeds the tutors' rating, the
 * pending-feedback item for the home popup, and the two admin email actions
 * with their cooldowns. Prisma, repositories, email, notifications and audit
 * are mocked. The last block runs the REAL event-survey.repository against
 * the mocked Prisma client to pin the query filters.
 */

const mockTx = { tx: true };

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn((fn) => fn(mockTx)),
    eventRegistration: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    review: { findMany: jest.fn() },
    event: { updateMany: jest.fn() },
  },
}));
jest.mock('@/lib/repositories/event.repository', () => ({
  findBySlug: jest.fn(),
  findById: jest.fn(),
}));
jest.mock('@/lib/repositories/event-registration.repository', () => ({
  lockEvent: jest.fn(),
  findRegistration: jest.fn(),
}));
jest.mock('@/lib/repositories/event-survey.repository', () => ({
  createResponseWithReviews: jest.fn(),
  findPendingEventSurvey: jest.fn(),
  findPendingSessionReview: jest.fn(),
  findConfirmedRegistrants: jest.fn(),
  claimEventReminder: jest.fn(),
  findSurveyReminderTargets: jest.fn(),
  markSurveyReminded: jest.fn(),
}));
jest.mock('@/lib/repositories/review.repository', () => ({ updateTutorReviewStats: jest.fn() }));
jest.mock('@/lib/repositories/user.repository', () => ({ findById: jest.fn() }));
jest.mock('@/lib/services/notification.service', () => ({ notifyReviewReceived: jest.fn() }));
jest.mock('@/lib/services/event-email.service', () => ({
  sendEventReminderTo: jest.fn(),
  sendSurveyReminderTo: jest.fn(),
}));
jest.mock('@/lib/services/email.service', () => ({
  EVENT_EMAIL: { REMINDER: 'EVENT_REMINDER', SURVEY_REMINDER: 'EVENT_SURVEY_REMINDER' },
  isEventEmailConfigured: jest.fn(),
}));
jest.mock('@/lib/services/admin-audit.service', () => ({
  ADMIN_ACTIONS: { EVENT_REMINDER: 'EVENT_REMINDER', EVENT_SURVEY_REMINDER: 'EVENT_SURVEY_REMINDER' },
  logAction: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const eventRepo = require('@/lib/repositories/event.repository');
const regRepo = require('@/lib/repositories/event-registration.repository');
const surveyRepo = require('@/lib/repositories/event-survey.repository');
const reviewRepo = require('@/lib/repositories/review.repository');
const userRepo = require('@/lib/repositories/user.repository');
const { notifyReviewReceived } = require('@/lib/services/notification.service');
const { sendEventReminderTo, sendSurveyReminderTo } = require('@/lib/services/event-email.service');
const { isEventEmailConfigured } = require('@/lib/services/email.service');
const audit = require('@/lib/services/admin-audit.service');
const service = require('@/lib/services/event-survey.service');

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = new Date('2026-10-03T15:00:00.000Z');
const ENDED_START = new Date(NOW.getTime() - 3 * HOUR);
const ENDED_END = new Date(NOW.getTime() - HOUR);
const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';

const err = (code) => expect.objectContaining({ code });

function tutorRow(id, name, position) {
  return { position, tutorId: id, tutor: { id, name, email: `${id}@x.co`, profilePictureUrl: null } };
}

function event(overrides = {}) {
  return {
    id: 'e1',
    slug: 'repaso-x',
    title: 'Repaso X',
    status: 'Published',
    startsAt: ENDED_START,
    endsAt: ENDED_END,
    courseId: 'c1',
    lastReminderAt: null,
    tutors: [tutorRow(T1, 'Tutor Uno', 0), tutorRow(T2, 'Tutor Dos', 1)],
    ...overrides,
  };
}

function locked(overrides = {}) {
  return { id: 'e1', status: 'Published', starts_at: ENDED_START, ends_at: ENDED_END, ...overrides };
}

const REG = { id: 'r1', eventId: 'e1', userId: 'u1', status: 'Confirmed' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  prisma.$transaction.mockImplementation((fn) => fn(mockTx));
  userRepo.findById.mockResolvedValue({ id: 'u1', name: 'Ana Gómez' });
  reviewRepo.updateTutorReviewStats.mockResolvedValue({});
  notifyReviewReceived.mockResolvedValue({});
  isEventEmailConfigured.mockReturnValue(true);
  audit.logAction.mockResolvedValue({});
});

afterEach(() => console.error.mockRestore());

// ─── submitSurvey ────────────────────────────────────────────────────────

describe('submitSurvey', () => {
  beforeEach(() => {
    eventRepo.findBySlug.mockResolvedValue(event());
    regRepo.lockEvent.mockResolvedValue(locked());
    regRepo.findRegistration.mockResolvedValue(REG);
    surveyRepo.createResponseWithReviews.mockResolvedValue({ id: 'resp-1' });
  });

  const answers = (overrides = {}) => ({
    slug: 'repaso-x',
    userId: 'u1',
    attended: true,
    eventRating: 5,
    tutorRatings: [
      { tutorId: T1, rating: 5, comment: '  Muy claro  ' },
      { tutorId: T2, rating: 3, comment: 'Bien' },
    ],
    now: NOW,
    ...overrides,
  });

  it('attended=false stores the response only: no reviews, no stats, no notifications', async () => {
    const out = await service.submitSurvey({ slug: 'repaso-x', userId: 'u1', attended: false, now: NOW });

    expect(out).toEqual({ responseId: 'resp-1', reviewsCreated: 0 });
    expect(regRepo.lockEvent).toHaveBeenCalledWith(mockTx, 'e1');
    expect(regRepo.findRegistration).toHaveBeenCalledWith(mockTx, 'e1', 'u1');
    expect(surveyRepo.createResponseWithReviews).toHaveBeenCalledWith(mockTx, {
      registrationId: 'r1',
      attended: false,
      eventRating: null,
      reviews: [],
    });
    expect(reviewRepo.updateTutorReviewStats).not.toHaveBeenCalled();
    expect(notifyReviewReceived).not.toHaveBeenCalled();
  });

  it('attended=false ignores any ratings sent along', async () => {
    await service.submitSurvey(answers({ attended: false, eventRating: 9, tutorRatings: [{ tutorId: 'x', rating: 0 }] }));

    expect(surveyRepo.createResponseWithReviews).toHaveBeenCalledWith(mockTx, expect.objectContaining({
      attended: false, eventRating: null, reviews: [],
    }));
  });

  it('attended=true creates the response + one done review per tutor in ONE transaction, then stats and notifications', async () => {
    const out = await service.submitSurvey(answers());

    expect(out).toEqual({ responseId: 'resp-1', reviewsCreated: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(surveyRepo.createResponseWithReviews).toHaveBeenCalledTimes(1);
    expect(surveyRepo.createResponseWithReviews).toHaveBeenCalledWith(mockTx, {
      registrationId: 'r1',
      attended: true,
      eventRating: 5,
      reviews: [
        { eventId: 'e1', tutorId: T1, studentId: 'u1', courseId: 'c1', rating: 5, comment: 'Muy claro', status: 'done' },
        { eventId: 'e1', tutorId: T2, studentId: 'u1', courseId: 'c1', rating: 3, comment: 'Bien', status: 'done' },
      ],
    });

    expect(reviewRepo.updateTutorReviewStats).toHaveBeenCalledTimes(2);
    expect(reviewRepo.updateTutorReviewStats).toHaveBeenCalledWith(T1);
    expect(reviewRepo.updateTutorReviewStats).toHaveBeenCalledWith(T2);
    expect(notifyReviewReceived).toHaveBeenCalledTimes(2);
    expect(notifyReviewReceived).toHaveBeenCalledWith(T1, 'Ana Gómez', 5, null);
    expect(notifyReviewReceived).toHaveBeenCalledWith(T2, 'Ana Gómez', 3, null);
  });

  it('stats and notifications run only after the transaction resolved', async () => {
    const order = [];
    prisma.$transaction.mockImplementation(async (fn) => {
      const result = await fn(mockTx);
      order.push('commit');
      return result;
    });
    reviewRepo.updateTutorReviewStats.mockImplementation(async () => { order.push('stats'); });
    notifyReviewReceived.mockImplementation(async () => { order.push('notify'); });

    await service.submitSurvey(answers());

    expect(order[0]).toBe('commit');
    expect(order.slice(1).sort()).toEqual(['notify', 'notify', 'stats', 'stats']);
  });

  it('an empty / missing comment is stored as null and an event without course gets courseId null', async () => {
    eventRepo.findBySlug.mockResolvedValue(event({ courseId: null }));

    await service.submitSurvey(answers({
      tutorRatings: [{ tutorId: T1, rating: 4, comment: '   ' }, { tutorId: T2, rating: 2 }],
    }));

    const { reviews } = surveyRepo.createResponseWithReviews.mock.calls[0][1];
    expect(reviews.map((r) => [r.comment, r.courseId])).toEqual([[null, null], [null, null]]);
  });

  it('a failed stats update after the commit is logged, not surfaced (the survey is saved)', async () => {
    reviewRepo.updateTutorReviewStats.mockRejectedValueOnce(new Error('no tutor profile'));

    await expect(service.submitSurvey(answers())).resolves.toEqual({ responseId: 'resp-1', reviewsCreated: 2 });
    expect(console.error).toHaveBeenCalled();
    expect(notifyReviewReceived).toHaveBeenCalledTimes(2);
  });

  describe('INVALID_SURVEY (nothing is written)', () => {
    const cases = [
      ['attended is not a boolean', { attended: 'yes' }],
      ['attended=true without eventRating', { eventRating: undefined }],
      ['eventRating 0', { eventRating: 0 }],
      ['eventRating 6', { eventRating: 6 }],
      ['eventRating not an integer', { eventRating: 4.5 }],
      ['tutor rating 0', { tutorRatings: [{ tutorId: T1, rating: 0 }, { tutorId: T2, rating: 3 }] }],
      ['tutor rating 6', { tutorRatings: [{ tutorId: T1, rating: 6 }, { tutorId: T2, rating: 3 }] }],
      ['tutorRatings missing', { tutorRatings: undefined }],
      ['a tutor is missing', { tutorRatings: [{ tutorId: T1, rating: 5 }] }],
      ['an extra stranger', { tutorRatings: [{ tutorId: T1, rating: 5 }, { tutorId: T2, rating: 4 }, { tutorId: 'stranger', rating: 4 }] }],
      ['a stranger instead of a tutor', { tutorRatings: [{ tutorId: T1, rating: 5 }, { tutorId: 'stranger', rating: 4 }] }],
      ['a duplicate tutor id', { tutorRatings: [{ tutorId: T1, rating: 5 }, { tutorId: T1, rating: 4 }] }],
      ['a comment longer than 1000 characters', { tutorRatings: [{ tutorId: T1, rating: 5, comment: 'a'.repeat(1001) }, { tutorId: T2, rating: 4 }] }],
      ['a comment that is not a string', { tutorRatings: [{ tutorId: T1, rating: 5, comment: 42 }, { tutorId: T2, rating: 4 }] }],
    ];

    it.each(cases)('%s', async (_label, overrides) => {
      await expect(service.submitSurvey(answers(overrides))).rejects.toEqual(err(service.SURVEY_ERROR.INVALID));
      expect(surveyRepo.createResponseWithReviews).not.toHaveBeenCalled();
      expect(reviewRepo.updateTutorReviewStats).not.toHaveBeenCalled();
      expect(notifyReviewReceived).not.toHaveBeenCalled();
    });

    it('a comment of exactly 1000 characters is accepted', async () => {
      await service.submitSurvey(answers({
        tutorRatings: [{ tutorId: T1, rating: 5, comment: 'a'.repeat(1000) }, { tutorId: T2, rating: 4 }],
      }));
      expect(surveyRepo.createResponseWithReviews).toHaveBeenCalled();
    });
  });

  describe('SURVEY_NOT_AVAILABLE', () => {
    it('no registration', async () => {
      regRepo.findRegistration.mockResolvedValue(null);
      await expect(service.submitSurvey(answers())).rejects.toEqual(err('SURVEY_NOT_AVAILABLE'));
      expect(surveyRepo.createResponseWithReviews).not.toHaveBeenCalled();
    });

    it.each(['PendingPayment', 'Canceled'])('registration %s', async (status) => {
      regRepo.findRegistration.mockResolvedValue({ ...REG, status });
      await expect(service.submitSurvey(answers())).rejects.toEqual(err('SURVEY_NOT_AVAILABLE'));
      expect(surveyRepo.createResponseWithReviews).not.toHaveBeenCalled();
    });

    it('event canceled', async () => {
      eventRepo.findBySlug.mockResolvedValue(event({ status: 'Canceled' }));
      regRepo.lockEvent.mockResolvedValue(locked({ status: 'Canceled' }));
      await expect(service.submitSurvey(answers())).rejects.toEqual(err('SURVEY_NOT_AVAILABLE'));
      expect(surveyRepo.createResponseWithReviews).not.toHaveBeenCalled();
    });

    it('event not ended yet (now < endsAt); exactly at endsAt it is available', async () => {
      const endsAt = new Date(NOW.getTime() + MIN);
      eventRepo.findBySlug.mockResolvedValue(event({ endsAt }));
      regRepo.lockEvent.mockResolvedValue(locked({ ends_at: endsAt }));
      await expect(service.submitSurvey(answers())).rejects.toEqual(err('SURVEY_NOT_AVAILABLE'));
      expect(surveyRepo.createResponseWithReviews).not.toHaveBeenCalled();

      await expect(service.submitSurvey(answers({ now: endsAt }))).resolves.toEqual(
        expect.objectContaining({ responseId: 'resp-1' }),
      );
    });
  });

  it('unknown slug or Draft → EVENT_NOT_FOUND', async () => {
    eventRepo.findBySlug.mockResolvedValue(null);
    await expect(service.submitSurvey(answers())).rejects.toEqual(err('EVENT_NOT_FOUND'));
    eventRepo.findBySlug.mockResolvedValue(event({ status: 'Draft' }));
    await expect(service.submitSurvey(answers())).rejects.toEqual(err('EVENT_NOT_FOUND'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a P2002 from the transaction (response already exists) → SURVEY_ALREADY_SUBMITTED; no stats', async () => {
    const unique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: {} });
    surveyRepo.createResponseWithReviews.mockRejectedValue(unique);

    await expect(service.submitSurvey(answers())).rejects.toEqual(err('SURVEY_ALREADY_SUBMITTED'));
    expect(reviewRepo.updateTutorReviewStats).not.toHaveBeenCalled();
    expect(notifyReviewReceived).not.toHaveBeenCalled();
  });

  it('any other transaction error is rethrown as is', async () => {
    const boom = new Error('db down');
    surveyRepo.createResponseWithReviews.mockRejectedValue(boom);
    await expect(service.submitSurvey(answers())).rejects.toBe(boom);
  });
});

// ─── getPendingFeedback ──────────────────────────────────────────────────

describe('getPendingFeedback', () => {
  const sessionRow = (overrides = {}) => ({
    id: 'rv1',
    tutorId: T1,
    session: {
      id: 's1',
      tutorId: T1,
      startTimestamp: new Date('2026-10-01T15:00:00.000Z'),
      endTimestamp: new Date('2026-10-01T16:00:00.000Z'),
      course: { name: 'Cálculo', code: 'MATE1203' },
      tutor: { name: 'Tutor Uno' },
    },
    ...overrides,
  });

  it('returns the event survey first, without querying sessions', async () => {
    surveyRepo.findPendingEventSurvey.mockResolvedValue({
      event: {
        id: 'e1',
        slug: 'repaso-x',
        title: 'Repaso X',
        endsAt: ENDED_END,
        tutors: [
          { tutor: { id: T1, name: 'Tutor Uno', profilePictureUrl: 'https://img/1' } },
          { tutor: { id: T2, name: 'Tutor Dos', profilePictureUrl: null } },
        ],
      },
    });

    const item = await service.getPendingFeedback('u1', NOW);

    expect(surveyRepo.findPendingEventSurvey).toHaveBeenCalledWith('u1', NOW);
    expect(surveyRepo.findPendingSessionReview).not.toHaveBeenCalled();
    expect(item).toEqual({
      type: 'event_survey',
      event: {
        id: 'e1',
        slug: 'repaso-x',
        title: 'Repaso X',
        endsAt: ENDED_END,
        tutors: [
          { id: T1, name: 'Tutor Uno', profilePictureUrl: 'https://img/1' },
          { id: T2, name: 'Tutor Dos', profilePictureUrl: null },
        ],
      },
    });
  });

  it('otherwise returns the session review in the ReviewModal shape, skipping rows whose tutor does not match the session', async () => {
    surveyRepo.findPendingEventSurvey.mockResolvedValue(null);
    surveyRepo.findPendingSessionReview.mockResolvedValue([
      sessionRow({ id: 'rv0', tutorId: 'someone-else', session: { ...sessionRow().session, id: 's0' } }),
      sessionRow(),
    ]);

    const item = await service.getPendingFeedback('u1', NOW);

    expect(surveyRepo.findPendingSessionReview).toHaveBeenCalledWith('u1', NOW);
    expect(item).toEqual({
      type: 'session_review',
      session: {
        id: 's1',
        tutorId: T1,
        tutorName: 'Tutor Uno',
        course: { name: 'Cálculo', code: 'MATE1203' },
        scheduledDateTime: new Date('2026-10-01T15:00:00.000Z'),
        startTimestamp: new Date('2026-10-01T15:00:00.000Z'),
        endTimestamp: new Date('2026-10-01T16:00:00.000Z'),
        pendingReview: { id: 'rv1', status: 'pending', rating: null },
      },
    });
  });

  it('null when there is nothing pending (or only mismatched rows)', async () => {
    surveyRepo.findPendingEventSurvey.mockResolvedValue(null);
    surveyRepo.findPendingSessionReview.mockResolvedValue([]);
    expect(await service.getPendingFeedback('u1', NOW)).toBeNull();

    surveyRepo.findPendingSessionReview.mockResolvedValue([sessionRow({ tutorId: 'someone-else' })]);
    expect(await service.getPendingFeedback('u1', NOW)).toBeNull();
  });
});

// ─── sendEventReminder ───────────────────────────────────────────────────

describe('sendEventReminder', () => {
  const UPCOMING_START = new Date(NOW.getTime() + 24 * HOUR);
  const upcoming = (overrides = {}) =>
    event({ startsAt: UPCOMING_START, endsAt: new Date(UPCOMING_START.getTime() + 2 * HOUR), ...overrides });
  const registrant = (id) => ({ id: `r-${id}`, user: { id, name: `User ${id}`, email: `${id}@x.co` } });
  const call = (overrides = {}) =>
    service.sendEventReminder({ eventId: 'e1', adminId: 'admin-1', request: { headers: {} }, now: NOW, ...overrides });

  beforeEach(() => {
    eventRepo.findById.mockResolvedValue(upcoming());
    surveyRepo.claimEventReminder.mockResolvedValue(true);
    surveyRepo.findConfirmedRegistrants.mockResolvedValue([registrant('u1'), registrant('u2')]);
    sendEventReminderTo.mockResolvedValue({ messageId: 'm' });
  });

  it('emails every Confirmed registrant returned by the repository', async () => {
    const out = await call();

    expect(surveyRepo.findConfirmedRegistrants).toHaveBeenCalledWith('e1');
    expect(sendEventReminderTo).toHaveBeenCalledTimes(2);
    expect(sendEventReminderTo).toHaveBeenCalledWith({ event: upcoming(), user: registrant('u1').user });
    expect(sendEventReminderTo).toHaveBeenCalledWith({ event: upcoming(), user: registrant('u2').user });
    expect(out).toEqual({
      sent: [{ userId: 'u1', email: 'u1@x.co' }, { userId: 'u2', email: 'u2@x.co' }],
      failed: [],
    });
  });

  it('lastReminderAt under 1 h ago → REMINDER_COOLDOWN, nothing sent', async () => {
    eventRepo.findById.mockResolvedValue(upcoming({ lastReminderAt: new Date(NOW.getTime() - 59 * MIN) }));

    await expect(call()).rejects.toEqual(err('REMINDER_COOLDOWN'));
    expect(surveyRepo.claimEventReminder).not.toHaveBeenCalled();
    expect(sendEventReminderTo).not.toHaveBeenCalled();
    expect(audit.logAction).not.toHaveBeenCalled();
  });

  it('lastReminderAt exactly 1 h ago is allowed; the claim compares against the value read', async () => {
    const last = new Date(NOW.getTime() - HOUR);
    eventRepo.findById.mockResolvedValue(upcoming({ lastReminderAt: last }));

    await call();
    expect(surveyRepo.claimEventReminder).toHaveBeenCalledWith('e1', last, NOW);
    expect(service.EVENT_REMINDER_COOLDOWN_MS).toBe(HOUR);
  });

  it('a concurrent click that already claimed the reminder → REMINDER_COOLDOWN, nothing sent', async () => {
    surveyRepo.claimEventReminder.mockResolvedValue(false);

    await expect(call()).rejects.toEqual(err('REMINDER_COOLDOWN'));
    expect(surveyRepo.findConfirmedRegistrants).not.toHaveBeenCalled();
    expect(sendEventReminderTo).not.toHaveBeenCalled();
  });

  it('template not configured → EMAIL_TEMPLATE_NOT_CONFIGURED before claiming, loading recipients or sending', async () => {
    isEventEmailConfigured.mockReturnValue(false);

    await expect(call()).rejects.toEqual(err('EMAIL_TEMPLATE_NOT_CONFIGURED'));
    expect(isEventEmailConfigured).toHaveBeenCalledWith('EVENT_REMINDER');
    expect(surveyRepo.claimEventReminder).not.toHaveBeenCalled();
    expect(surveyRepo.findConfirmedRegistrants).not.toHaveBeenCalled();
    expect(sendEventReminderTo).not.toHaveBeenCalled();
  });

  it('updates lastReminderAt (claim with now) and audits EVENT_REMINDER', async () => {
    sendEventReminderTo.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bounce'));

    const out = await call();

    expect(surveyRepo.claimEventReminder).toHaveBeenCalledWith('e1', null, NOW);
    expect(out).toEqual({
      sent: [{ userId: 'u1', email: 'u1@x.co' }],
      failed: [{ userId: 'u2', email: 'u2@x.co', reason: 'SEND_FAILED' }],
    });
    expect(audit.logAction).toHaveBeenCalledWith({
      adminId: 'admin-1',
      action: 'EVENT_REMINDER',
      targetType: 'Event',
      targetId: 'e1',
      payload: { slug: 'repaso-x', sentUserIds: ['u1'], failedUserIds: ['u2'] },
      request: { headers: {} },
    });
  });

  it('NOT_FOUND for an unknown event', async () => {
    eventRepo.findById.mockResolvedValue(null);
    await expect(call()).rejects.toEqual(err('NOT_FOUND'));
  });

  it.each([
    ['Draft', { status: 'Draft' }],
    ['Canceled', { status: 'Canceled' }],
    ['already ended', { startsAt: ENDED_START, endsAt: ENDED_END }],
  ])('INVALID_STATE for a %s event', async (_label, overrides) => {
    eventRepo.findById.mockResolvedValue(upcoming(overrides));
    await expect(call()).rejects.toEqual(err('INVALID_STATE'));
    expect(sendEventReminderTo).not.toHaveBeenCalled();
    expect(surveyRepo.claimEventReminder).not.toHaveBeenCalled();
  });
});

// ─── sendSurveyReminders ─────────────────────────────────────────────────

describe('sendSurveyReminders', () => {
  const target = (id) => ({ id: `r-${id}`, user: { id, name: `User ${id}`, email: `${id}@x.co` } });
  const call = (overrides = {}) =>
    service.sendSurveyReminders({ eventId: 'e1', adminId: 'admin-1', request: { headers: {} }, now: NOW, ...overrides });

  beforeEach(() => {
    eventRepo.findById.mockResolvedValue(event());
    surveyRepo.findSurveyReminderTargets.mockResolvedValue({
      targets: [target('u1'), target('u2')],
      excluded: [
        { id: 'r-u3', answered: true, surveyRemindedAt: null, user: { id: 'u3', name: 'U3', email: 'u3@x.co' } },
        { id: 'r-u4', answered: false, surveyRemindedAt: new Date(NOW.getTime() - HOUR), user: { id: 'u4', name: 'U4', email: 'u4@x.co' } },
      ],
    });
    sendSurveyReminderTo.mockResolvedValue({ messageId: 'm' });
    surveyRepo.markSurveyReminded.mockResolvedValue({ count: 2 });
  });

  it.each([
    ['not ended yet', { endsAt: new Date(NOW.getTime() + MIN) }],
    ['Canceled', { status: 'Canceled' }],
    ['Draft', { status: 'Draft' }],
  ])('INVALID_STATE when the event is %s', async (_label, overrides) => {
    eventRepo.findById.mockResolvedValue(event(overrides));
    await expect(call()).rejects.toEqual(err('INVALID_STATE'));
    expect(surveyRepo.findSurveyReminderTargets).not.toHaveBeenCalled();
    expect(sendSurveyReminderTo).not.toHaveBeenCalled();
  });

  it('NOT_FOUND for an unknown event', async () => {
    eventRepo.findById.mockResolvedValue(null);
    await expect(call()).rejects.toEqual(err('NOT_FOUND'));
  });

  it('template not configured → EMAIL_TEMPLATE_NOT_CONFIGURED before loading targets', async () => {
    isEventEmailConfigured.mockReturnValue(false);
    await expect(call()).rejects.toEqual(err('EMAIL_TEMPLATE_NOT_CONFIGURED'));
    expect(isEventEmailConfigured).toHaveBeenCalledWith('EVENT_SURVEY_REMINDER');
    expect(surveyRepo.findSurveyReminderTargets).not.toHaveBeenCalled();
  });

  it('emails only the targets from findSurveyReminderTargets, which receives now and the 24 h cooldown', async () => {
    await call();

    expect(surveyRepo.findSurveyReminderTargets).toHaveBeenCalledWith('e1', NOW, 24 * HOUR);
    expect(service.SURVEY_REMINDER_COOLDOWN_MS).toBe(24 * HOUR);
    expect(sendSurveyReminderTo).toHaveBeenCalledTimes(2);
    expect(sendSurveyReminderTo).toHaveBeenCalledWith({ event: event(), user: target('u1').user });
    expect(sendSurveyReminderTo).toHaveBeenCalledWith({ event: event(), user: target('u2').user });
  });

  it('sets surveyRemindedAt only for the successful sends', async () => {
    sendSurveyReminderTo.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bounce'));

    await call();

    expect(surveyRepo.markSurveyReminded).toHaveBeenCalledWith(['r-u1'], NOW);
  });

  it('does not touch surveyRemindedAt when nothing was sent', async () => {
    sendSurveyReminderTo.mockRejectedValue(new Error('bounce'));
    await call();
    expect(surveyRepo.markSurveyReminded).not.toHaveBeenCalled();
  });

  it('returns { sent, failed, skipped } with ANSWERED / RECENTLY_REMINDED reasons and audits EVENT_SURVEY_REMINDER', async () => {
    sendSurveyReminderTo.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bounce'));

    const out = await call();

    expect(out).toEqual({
      sent: [{ userId: 'u1', email: 'u1@x.co' }],
      failed: [{ userId: 'u2', email: 'u2@x.co', reason: 'SEND_FAILED' }],
      skipped: [
        { userId: 'u3', email: 'u3@x.co', reason: 'ANSWERED' },
        { userId: 'u4', email: 'u4@x.co', reason: 'RECENTLY_REMINDED', lastRemindedAt: new Date(NOW.getTime() - HOUR) },
      ],
    });
    expect(audit.logAction).toHaveBeenCalledWith({
      adminId: 'admin-1',
      action: 'EVENT_SURVEY_REMINDER',
      targetType: 'Event',
      targetId: 'e1',
      payload: { slug: 'repaso-x', sentUserIds: ['u1'], failedUserIds: ['u2'], skippedCount: 2 },
      request: { headers: {} },
    });
  });
});

// ─── event-survey.repository queries (real module, mocked Prisma) ────────

describe('event-survey.repository queries', () => {
  const repo = jest.requireActual('@/lib/repositories/event-survey.repository');

  it('createResponseWithReviews creates the response first, then the reviews with createMany', async () => {
    const order = [];
    const tx = {
      eventSurveyResponse: { create: jest.fn(async () => { order.push('response'); return { id: 'resp-1' }; }) },
      review: { createMany: jest.fn(async () => { order.push('reviews'); }) },
    };
    const reviews = [{ eventId: 'e1', tutorId: T1, studentId: 'u1', courseId: 'c1', rating: 5, comment: null, status: 'done' }];

    const out = await repo.createResponseWithReviews(tx, { registrationId: 'r1', attended: true, eventRating: 4, reviews });

    expect(out).toEqual({ id: 'resp-1' });
    expect(order).toEqual(['response', 'reviews']);
    expect(tx.eventSurveyResponse.create).toHaveBeenCalledWith({ data: { registrationId: 'r1', attended: true, eventRating: 4 } });
    expect(tx.review.createMany).toHaveBeenCalledWith({ data: reviews });
  });

  it('createResponseWithReviews: attended=false stores a null eventRating and creates no reviews', async () => {
    const tx = { eventSurveyResponse: { create: jest.fn(async () => ({ id: 'x' })) }, review: { createMany: jest.fn() } };
    await repo.createResponseWithReviews(tx, { registrationId: 'r1', attended: false, eventRating: 5, reviews: [] });
    expect(tx.eventSurveyResponse.create).toHaveBeenCalledWith({ data: { registrationId: 'r1', attended: false, eventRating: null } });
    expect(tx.review.createMany).not.toHaveBeenCalled();
  });

  it('findPendingEventSurvey: Confirmed, unanswered, ended, not canceled; most recently ended first', async () => {
    prisma.eventRegistration.findFirst.mockResolvedValue(null);
    await repo.findPendingEventSurvey('u1', NOW);

    const args = prisma.eventRegistration.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({
      userId: 'u1',
      status: 'Confirmed',
      surveyResponse: { is: null },
      event: { endsAt: { lt: NOW }, status: { not: 'Canceled' } },
    });
    expect(args.orderBy).toEqual({ event: { endsAt: 'desc' } });
  });

  it('findPendingSessionReview: pending, unrated, session-side, past, not Canceled/Rejected; latest session first', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    await repo.findPendingSessionReview('u1', NOW);

    const args = prisma.review.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      studentId: 'u1',
      status: 'pending',
      rating: null,
      sessionId: { not: null },
      session: { endTimestamp: { lt: NOW }, status: { notIn: ['Canceled', 'Rejected'] } },
    });
    expect(args.orderBy).toEqual({ session: { endTimestamp: 'desc' } });
  });

  it('findConfirmedRegistrants: only Confirmed registrations of the event', async () => {
    prisma.eventRegistration.findMany.mockResolvedValue([]);
    await repo.findConfirmedRegistrants('e1');
    expect(prisma.eventRegistration.findMany.mock.calls[0][0].where).toEqual({ eventId: 'e1', status: 'Confirmed' });
  });

  it('claimEventReminder: compare-and-set on the lastReminderAt value read', async () => {
    const last = new Date(NOW.getTime() - 2 * HOUR);
    prisma.event.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await repo.claimEventReminder('e1', last, NOW)).toBe(true);
    expect(await repo.claimEventReminder('e1', null, NOW)).toBe(false);
    expect(prisma.event.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'e1', lastReminderAt: last },
      data: { lastReminderAt: NOW },
    });
    expect(prisma.event.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'e1', lastReminderAt: null },
      data: { lastReminderAt: NOW },
    });
  });

  it('findSurveyReminderTargets: Confirmed + unanswered + reminded never or before now − cooldown; the rest of Confirmed is excluded', async () => {
    const cutoff = new Date(NOW.getTime() - 24 * HOUR);
    prisma.eventRegistration.findMany
      .mockResolvedValueOnce([{ id: 'r1', surveyRemindedAt: null, surveyResponse: null, user: { id: 'u1' } }])
      .mockResolvedValueOnce([{ id: 'r2', surveyRemindedAt: null, surveyResponse: { id: 's' }, user: { id: 'u2' } }]);

    const out = await repo.findSurveyReminderTargets('e1', NOW, 24 * HOUR);

    const [targetsArgs, excludedArgs] = prisma.eventRegistration.findMany.mock.calls.map((c) => c[0]);
    expect(targetsArgs.where).toEqual({
      eventId: 'e1',
      status: 'Confirmed',
      surveyResponse: { is: null },
      OR: [{ surveyRemindedAt: null }, { surveyRemindedAt: { lt: cutoff } }],
    });
    expect(excludedArgs.where).toEqual({
      eventId: 'e1',
      status: 'Confirmed',
      OR: [{ surveyResponse: { isNot: null } }, { surveyRemindedAt: { gte: cutoff } }],
    });
    expect(out).toEqual({
      targets: [{ id: 'r1', surveyRemindedAt: null, answered: false, user: { id: 'u1' } }],
      excluded: [{ id: 'r2', surveyRemindedAt: null, answered: true, user: { id: 'u2' } }],
    });
  });

  it('markSurveyReminded: stamps the given registrations', async () => {
    prisma.eventRegistration.updateMany.mockResolvedValue({ count: 1 });
    await repo.markSurveyReminded(['r1'], NOW);
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] } },
      data: { surveyRemindedAt: NOW },
    });
  });
});
