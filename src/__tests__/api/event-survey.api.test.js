/**
 * @jest-environment node
 *
 * Survey, pending-feedback and admin reminder routes: guards, identity from
 * the JWT, body validation, error-code mapping, rate limit and cache headers.
 *   POST /api/events/[slug]/survey
 *   GET  /api/me/pending-feedback
 *   POST /api/admin/events/[id]/remind
 *   POST /api/admin/events/[id]/survey-reminder
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null) }));
jest.mock('@/lib/services/event-survey.service', () => ({
  submitSurvey: jest.fn(),
  getPendingFeedback: jest.fn(),
  sendEventReminder: jest.fn(),
  sendSurveyReminders: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { requireAdminUser } = require('@/lib/auth/guards');
const { rateLimit } = require('@/lib/auth/rateLimit');
const service = require('@/lib/services/event-survey.service');
const surveyRoute = require('@/app/api/events/[slug]/survey/route');
const pendingRoute = require('@/app/api/me/pending-feedback/route');
const remindRoute = require('@/app/api/admin/events/[id]/remind/route');
const surveyReminderRoute = require('@/app/api/admin/events/[id]/survey-reminder/route');

const SLUG = 'repaso-x';
const ID = '3f4c8d6a-1b2c-4d5e-8f90-123456789abc';
const T1 = '11111111-1111-4111-8111-111111111111';
const slugParams = { params: Promise.resolve({ slug: SLUG }) };
const idParams = (id = ID) => ({ params: Promise.resolve({ id }) });

function req(method, url, body, { raw } = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const postSurvey = (body, opts) => surveyRoute.POST(req('POST', `/api/events/${SLUG}/survey`, body, opts), slugParams);
const getPending = () => pendingRoute.GET(req('GET', '/api/me/pending-feedback'));
const postRemind = (id) => remindRoute.POST(req('POST', `/api/admin/events/${id ?? ID}/remind`), idParams(id));
const postSurveyReminder = (id) =>
  surveyReminderRoute.POST(req('POST', `/api/admin/events/${id ?? ID}/survey-reminder`), idParams(id));

const serviceError = (code) => Object.assign(new Error(code), { code });
const unauthorized = () => NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });
const forbidden = () => NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });

const validSurvey = {
  attended: true,
  eventRating: 5,
  tutorRatings: [{ tutorId: T1, rating: 4, comment: 'Muy claro' }],
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  authenticateRequest.mockResolvedValue({ sub: 'u1' });
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
  rateLimit.mockImplementation(() => null);
  service.submitSurvey.mockResolvedValue({ responseId: 'resp-1', reviewsCreated: 1 });
  service.getPendingFeedback.mockResolvedValue(null);
  service.sendEventReminder.mockResolvedValue({ sent: [{ userId: 'u1', email: 'a@x.co' }], failed: [] });
  service.sendSurveyReminders.mockResolvedValue({ sent: [], failed: [], skipped: [{ userId: 'u2', reason: 'ANSWERED' }] });
});

afterEach(() => console.error.mockRestore());

// ─── Guards ──────────────────────────────────────────────────────────────

describe('guards', () => {
  it('401 without auth on the survey and pending-feedback routes; no service call', async () => {
    authenticateRequest.mockResolvedValue(unauthorized());

    expect((await postSurvey(validSurvey)).status).toBe(401);
    expect((await getPending()).status).toBe(401);
    expect(service.submitSurvey).not.toHaveBeenCalled();
    expect(service.getPendingFeedback).not.toHaveBeenCalled();
  });

  it('non-admins are refused on both reminder routes', async () => {
    requireAdminUser.mockResolvedValue(forbidden());

    expect((await postRemind()).status).toBe(403);
    expect((await postSurveyReminder()).status).toBe(403);
    expect(service.sendEventReminder).not.toHaveBeenCalled();
    expect(service.sendSurveyReminders).not.toHaveBeenCalled();
  });
});

// ─── POST /api/events/[slug]/survey ──────────────────────────────────────

describe('POST /api/events/[slug]/survey', () => {
  it('201 { success } and the user is auth.sub, never the body', async () => {
    const res = await postSurvey({ ...validSurvey, userId: 'evil', studentId: 'evil' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true });
    expect(service.submitSurvey).toHaveBeenCalledWith({
      slug: SLUG,
      userId: 'u1',
      attended: true,
      eventRating: 5,
      tutorRatings: [{ tutorId: T1, rating: 4, comment: 'Muy claro' }],
    });
  });

  it('attended=false alone is a valid body', async () => {
    const res = await postSurvey({ attended: false });
    expect(res.status).toBe(201);
    expect(service.submitSurvey).toHaveBeenCalledWith({ slug: SLUG, userId: 'u1', attended: false });
  });

  it('rate-limits per user under survey:<sub>, 10 per minute', async () => {
    await postSurvey(validSurvey);
    expect(rateLimit).toHaveBeenCalledWith('survey:u1', { max: 10, windowMs: 60_000 });

    rateLimit.mockImplementation(() => NextResponse.json({ error: 'Too many' }, { status: 429 }));
    expect((await postSurvey(validSurvey)).status).toBe(429);
    expect(service.submitSurvey).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['eventRating 6', { ...validSurvey, eventRating: 6 }],
    ['tutor rating 6', { ...validSurvey, tutorRatings: [{ tutorId: T1, rating: 6 }] }],
    ['tutor rating 0', { ...validSurvey, tutorRatings: [{ tutorId: T1, rating: 0 }] }],
    ['non-integer rating', { ...validSurvey, eventRating: 4.5 }],
    ['attended missing', { eventRating: 5 }],
    ['attended not boolean', { attended: 'yes' }],
    ['tutorId not a uuid', { ...validSurvey, tutorRatings: [{ tutorId: 'abc', rating: 4 }] }],
    ['comment over 1000 characters', { ...validSurvey, tutorRatings: [{ tutorId: T1, rating: 4, comment: 'a'.repeat(1001) }] }],
    ['more than 10 tutor ratings', { ...validSurvey, tutorRatings: Array.from({ length: 11 }, () => ({ tutorId: T1, rating: 4 })) }],
  ])('400 on %s; no service call', async (_label, body) => {
    const res = await postSurvey(body);
    expect(res.status).toBe(400);
    expect(service.submitSurvey).not.toHaveBeenCalled();
  });

  it('400 on a body that is not JSON', async () => {
    const res = await postSurvey(undefined, { raw: '{nope' });
    expect(res.status).toBe(400);
    expect(service.submitSurvey).not.toHaveBeenCalled();
  });

  it.each([
    ['SURVEY_NOT_AVAILABLE', 409],
    ['SURVEY_ALREADY_SUBMITTED', 409],
    ['INVALID_SURVEY', 400],
    ['EVENT_NOT_FOUND', 404],
  ])('%s → %i with the code as error', async (code, status) => {
    service.submitSurvey.mockRejectedValue(serviceError(code));
    const res = await postSurvey(validSurvey);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ success: false, error: code });
  });

  it('an unexpected error → 500 INTERNAL_ERROR', async () => {
    service.submitSurvey.mockRejectedValue(new Error('db down'));
    const res = await postSurvey(validSurvey);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'INTERNAL_ERROR' });
  });
});

// ─── GET /api/me/pending-feedback ────────────────────────────────────────

describe('GET /api/me/pending-feedback', () => {
  it('returns { success, item } for auth.sub with Cache-Control private, no-store', async () => {
    const item = { type: 'event_survey', event: { id: 'e1', slug: SLUG, title: 'Repaso X', tutors: [] } };
    service.getPendingFeedback.mockResolvedValue(item);

    const res = await getPending();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({ success: true, item });
    expect(service.getPendingFeedback).toHaveBeenCalledWith('u1');
  });

  it('item is null when nothing is pending', async () => {
    const res = await getPending();
    expect(await res.json()).toEqual({ success: true, item: null });
  });

  it('an unexpected error → 500', async () => {
    service.getPendingFeedback.mockRejectedValue(new Error('db down'));
    expect((await getPending()).status).toBe(500);
  });
});

// ─── Admin reminders ─────────────────────────────────────────────────────

describe('POST /api/admin/events/[id]/remind', () => {
  it('returns { sent, failed }; adminId is auth.sub', async () => {
    const res = await postRemind();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, sent: [{ userId: 'u1', email: 'a@x.co' }], failed: [] });
    expect(service.sendEventReminder).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: ID, adminId: 'admin-1', request: expect.any(Request) }),
    );
  });

  it('400 on a non-uuid id; no service call', async () => {
    expect((await postRemind('not-a-uuid')).status).toBe(400);
    expect(service.sendEventReminder).not.toHaveBeenCalled();
  });

  it.each([
    ['REMINDER_COOLDOWN', 429],
    ['EMAIL_TEMPLATE_NOT_CONFIGURED', 503],
    ['INVALID_STATE', 409],
    ['NOT_FOUND', 404],
  ])('%s → %i', async (code, status) => {
    service.sendEventReminder.mockRejectedValue(serviceError(code));
    const res = await postRemind();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(expect.objectContaining({ success: false, code }));
  });
});

describe('POST /api/admin/events/[id]/survey-reminder', () => {
  it('returns { sent, failed, skipped }; adminId is auth.sub', async () => {
    const res = await postSurveyReminder();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      sent: [],
      failed: [],
      skipped: [{ userId: 'u2', reason: 'ANSWERED' }],
    });
    expect(service.sendSurveyReminders).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: ID, adminId: 'admin-1', request: expect.any(Request) }),
    );
  });

  it('400 on a non-uuid id; no service call', async () => {
    expect((await postSurveyReminder('nope')).status).toBe(400);
    expect(service.sendSurveyReminders).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_STATE', 409],
    ['EMAIL_TEMPLATE_NOT_CONFIGURED', 503],
    ['NOT_FOUND', 404],
  ])('%s → %i', async (code, status) => {
    service.sendSurveyReminders.mockRejectedValue(serviceError(code));
    const res = await postSurveyReminder();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(expect.objectContaining({ success: false, code }));
  });

  it('an unexpected error → 500', async () => {
    service.sendSurveyReminders.mockRejectedValue(new Error('db down'));
    expect((await postSurveyReminder()).status).toBe(500);
  });
});
