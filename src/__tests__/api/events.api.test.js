/**
 * @jest-environment node
 *
 * Public / student / tutor event routes: guards, identity from the JWT,
 * body validation, error-code mapping, rate limit and cache headers.
 *   GET  /api/events
 *   GET  /api/events/[slug]
 *   POST /api/events/[slug]/register
 *   POST /api/events/[slug]/checkout
 *   POST /api/events/[slug]/cancel-registration
 *   GET  /api/me/events
 *   GET  /api/tutor/events
 */

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
  tryAuthenticateRequest: jest.fn(),
}));
jest.mock('@/lib/auth/guards', () => ({ requireTutor: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null) }));
jest.mock('@/lib/services/event-checkout.service', () => ({
  registerFree: jest.fn(),
  startCheckout: jest.fn(),
  cancelRegistration: jest.fn(),
}));
jest.mock('@/lib/services/event.service', () => ({
  listPublicEvents: jest.fn(),
  getPublicEvent: jest.fn(),
  getMyEvents: jest.fn(),
  getTutorEvents: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest, tryAuthenticateRequest } = require('@/lib/auth/middleware');
const { requireTutor } = require('@/lib/auth/guards');
const { rateLimit } = require('@/lib/auth/rateLimit');
const checkoutService = require('@/lib/services/event-checkout.service');
const eventService = require('@/lib/services/event.service');
const { eventsErrorResponse } = require('@/app/api/events/_errors');
const listRoute = require('@/app/api/events/route');
const slugRoute = require('@/app/api/events/[slug]/route');
const registerRoute = require('@/app/api/events/[slug]/register/route');
const checkoutRoute = require('@/app/api/events/[slug]/checkout/route');
const cancelRoute = require('@/app/api/events/[slug]/cancel-registration/route');
const meRoute = require('@/app/api/me/events/route');
const tutorRoute = require('@/app/api/tutor/events/route');

const SLUG = 'repaso-x';
const params = { params: Promise.resolve({ slug: SLUG }) };

function req(method, url, body, { auth = true, raw } = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer t' } : {}) },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const post = (route, path, body, opts) => route.POST(req('POST', `/api/events/${SLUG}/${path}`, body, opts), params);
const serviceError = (code) => Object.assign(new Error(code), { code });
const unauthorized = () => NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  authenticateRequest.mockResolvedValue({ sub: 'u1' });
  tryAuthenticateRequest.mockResolvedValue(null);
  rateLimit.mockImplementation(() => null);
  requireTutor.mockResolvedValue({ sub: 't1', isTutorApproved: true });
  checkoutService.registerFree.mockResolvedValue({ id: 'r1', status: 'Confirmed', finalAmount: '0', userId: 'u1' });
  checkoutService.startCheckout.mockResolvedValue({ reference: 'EVT-1', amountInCents: 1800000 });
  checkoutService.cancelRegistration.mockResolvedValue({ registration: { id: 'r1' }, refundable: true });
});

afterEach(() => console.error.mockRestore());

// ─── Guards ──────────────────────────────────────────────────────────────

describe('guards', () => {
  it('401 without auth on every POST and on /api/me/events; no service is called', async () => {
    authenticateRequest.mockResolvedValue(unauthorized());

    expect((await post(registerRoute, 'register', {}, { auth: false })).status).toBe(401);
    expect((await post(checkoutRoute, 'checkout', {}, { auth: false })).status).toBe(401);
    expect((await post(cancelRoute, 'cancel-registration', {}, { auth: false })).status).toBe(401);
    expect((await meRoute.GET(req('GET', '/api/me/events', undefined, { auth: false }))).status).toBe(401);

    expect(checkoutService.registerFree).not.toHaveBeenCalled();
    expect(checkoutService.startCheckout).not.toHaveBeenCalled();
    expect(checkoutService.cancelRegistration).not.toHaveBeenCalled();
    expect(eventService.getMyEvents).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('403 from requireTutor on the tutor route', async () => {
    requireTutor.mockResolvedValue(NextResponse.json({ success: false, error: 'TUTOR_NOT_APPROVED' }, { status: 403 }));

    const res = await tutorRoute.GET(req('GET', '/api/tutor/events'));

    expect(res.status).toBe(403);
    expect(eventService.getTutorEvents).not.toHaveBeenCalled();
  });
});

// ─── Rate limit ──────────────────────────────────────────────────────────

describe('rate limit', () => {
  it('keys on the user (10/min) and passes a 429 through on every POST', async () => {
    rateLimit.mockImplementation(() => NextResponse.json({ success: false, error: 'RATE_LIMITED' }, { status: 429 }));

    for (const [route, path] of [[registerRoute, 'register'], [checkoutRoute, 'checkout'], [cancelRoute, 'cancel-registration']]) {
      const res = await post(route, path, {});
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ error: 'RATE_LIMITED' });
    }
    expect(rateLimit).toHaveBeenCalledWith('events:u1', { max: 10, windowMs: 60_000 });
    expect(checkoutService.registerFree).not.toHaveBeenCalled();
    expect(checkoutService.startCheckout).not.toHaveBeenCalled();
    expect(checkoutService.cancelRegistration).not.toHaveBeenCalled();
  });
});

// ─── register / checkout ─────────────────────────────────────────────────

describe('POST /api/events/[slug]/register', () => {
  it('201 with only { id, status }; identity from the JWT, never the body', async () => {
    const res = await post(registerRoute, 'register', { userId: 'evil', source: 'ig', marketingOptIn: true });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, registration: { id: 'r1', status: 'Confirmed' } });
    expect(checkoutService.registerFree).toHaveBeenCalledWith({ slug: SLUG, userId: 'u1', source: 'ig', marketingOptIn: true });
  });

  it('normalises a valid source and drops an invalid one instead of rejecting', async () => {
    await post(registerRoute, 'register', { source: '  IG_Story ' });
    expect(checkoutService.registerFree).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'ig_story' }));

    const res = await post(registerRoute, 'register', { source: 'bad source!' });
    expect(res.status).toBe(201);
    expect(checkoutService.registerFree).toHaveBeenLastCalledWith(expect.objectContaining({ source: undefined }));

    await post(registerRoute, 'register', { source: 'x'.repeat(41) });
    expect(checkoutService.registerFree).toHaveBeenLastCalledWith(expect.objectContaining({ source: undefined }));
  });

  it('accepts an empty body', async () => {
    const res = await post(registerRoute, 'register', undefined);
    expect(res.status).toBe(201);
    expect(checkoutService.registerFree).toHaveBeenCalledWith({ slug: SLUG, userId: 'u1', source: undefined, marketingOptIn: undefined });
  });

  it('400 on invalid JSON or a non-boolean marketingOptIn', async () => {
    expect((await post(registerRoute, 'register', undefined, { raw: '{oops' })).status).toBe(400);
    const res = await post(registerRoute, 'register', { marketingOptIn: 'yes' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'INVALID_BODY' });
    expect(checkoutService.registerFree).not.toHaveBeenCalled();
  });
});

describe('POST /api/events/[slug]/checkout', () => {
  it('200 with the signed checkout; identity from the JWT', async () => {
    const res = await post(checkoutRoute, 'checkout', { userId: 'evil', source: 'WA', marketingOptIn: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, checkout: { reference: 'EVT-1', amountInCents: 1800000 } });
    expect(checkoutService.startCheckout).toHaveBeenCalledWith({ slug: SLUG, userId: 'u1', source: 'wa', marketingOptIn: false });
  });

  it('drops an invalid source', async () => {
    await post(checkoutRoute, 'checkout', { source: '<script>' });
    expect(checkoutService.startCheckout).toHaveBeenCalledWith(expect.objectContaining({ source: undefined }));
  });
});

// ─── cancel-registration ─────────────────────────────────────────────────

describe('POST /api/events/[slug]/cancel-registration', () => {
  it('passes the refund choice through and returns { refundable }; identity from the JWT', async () => {
    const res = await post(cancelRoute, 'cancel-registration', { userId: 'evil', refundMethod: 'nequi', refundMethodDetails: ' 3001234567 ' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, refundable: true });
    expect(checkoutService.cancelRegistration).toHaveBeenCalledWith({
      slug: SLUG, userId: 'u1', refundMethod: 'nequi', refundMethodDetails: '3001234567',
    });
  });

  it('accepts the tutoring refund methods and an empty body (free / < 6 h)', async () => {
    for (const method of ['llave', 'nequi', 'use_future_session']) {
      expect((await post(cancelRoute, 'cancel-registration', { refundMethod: method, refundMethodDetails: 'x' })).status).toBe(200);
    }
    await post(cancelRoute, 'cancel-registration', undefined);
    expect(checkoutService.cancelRegistration).toHaveBeenLastCalledWith({
      slug: SLUG, userId: 'u1', refundMethod: null, refundMethodDetails: null,
    });
  });

  it('400 on an unknown refund method or details over 200 chars', async () => {
    expect((await post(cancelRoute, 'cancel-registration', { refundMethod: 'cash', refundMethodDetails: 'x' })).status).toBe(400);
    expect((await post(cancelRoute, 'cancel-registration', { refundMethod: 'nequi', refundMethodDetails: 'x'.repeat(201) })).status).toBe(400);
    expect(checkoutService.cancelRegistration).not.toHaveBeenCalled();
  });
});

// ─── Error mapping ───────────────────────────────────────────────────────

describe('error-code mapping', () => {
  it.each([
    ['EVENT_NOT_FOUND', 404],
    ['EVENT_NOT_OPEN', 409],
    ['ALREADY_REGISTERED', 409],
    ['NOT_REGISTERED', 409],
    ['EVENT_IS_FREE', 400],
    ['EVENT_IS_PAID', 400],
    ['REFUND_DETAILS_REQUIRED', 400],
    ['SURVEY_NOT_AVAILABLE', 409],
    ['SURVEY_ALREADY_SUBMITTED', 409],
    ['INVALID_SURVEY', 400],
  ])('%s → %i { success: false, error: code }', async (code, status) => {
    const res = eventsErrorResponse(serviceError(code), 'test');
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ success: false, error: code });
  });

  it('unknown errors become a logged 500 without leaking the message', async () => {
    const res = eventsErrorResponse(new Error('relation "x" does not exist'), 'test');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'INTERNAL_ERROR' });
    expect(console.error).toHaveBeenCalledWith('[test]', 'relation "x" does not exist');
  });

  it('every route maps its service errors', async () => {
    checkoutService.registerFree.mockRejectedValue(serviceError('EVENT_IS_PAID'));
    checkoutService.startCheckout.mockRejectedValue(serviceError('ALREADY_REGISTERED'));
    checkoutService.cancelRegistration.mockRejectedValue(serviceError('REFUND_DETAILS_REQUIRED'));
    eventService.getPublicEvent.mockRejectedValue(serviceError('EVENT_NOT_FOUND'));
    eventService.listPublicEvents.mockRejectedValue(new Error('db down'));
    eventService.getMyEvents.mockRejectedValue(new Error('db down'));
    eventService.getTutorEvents.mockRejectedValue(new Error('db down'));

    expect((await post(registerRoute, 'register', {})).status).toBe(400);
    expect((await post(checkoutRoute, 'checkout', {})).status).toBe(409);
    expect((await post(cancelRoute, 'cancel-registration', {})).status).toBe(400);
    expect((await slugRoute.GET(req('GET', `/api/events/${SLUG}`, undefined, { auth: false }), params)).status).toBe(404);
    expect((await listRoute.GET(req('GET', '/api/events', undefined, { auth: false }))).status).toBe(500);
    expect((await meRoute.GET(req('GET', '/api/me/events'))).status).toBe(500);
    expect((await tutorRoute.GET(req('GET', '/api/tutor/events'))).status).toBe(500);
  });
});

// ─── Public and personal reads ───────────────────────────────────────────

describe('reads', () => {
  it('GET /api/events works without auth and is CDN-cacheable for 30 s', async () => {
    eventService.listPublicEvents.mockResolvedValue([{ id: 'e1' }]);

    const res = await listRoute.GET(req('GET', '/api/events', undefined, { auth: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, events: [{ id: 'e1' }] });
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=30, stale-while-revalidate=150');
  });

  it('GET /api/events/[slug] works anonymously and is never cached', async () => {
    eventService.getPublicEvent.mockResolvedValue({ event: { id: 'e1' }, myRegistration: null });

    const res = await slugRoute.GET(req('GET', `/api/events/${SLUG}`, undefined, { auth: false }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: { id: 'e1' }, myRegistration: null });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(eventService.getPublicEvent).toHaveBeenCalledWith({ slug: SLUG, viewerId: null });
  });

  it('GET /api/events/[slug] personalises with the optional token', async () => {
    tryAuthenticateRequest.mockResolvedValue({ sub: 'u1' });
    eventService.getPublicEvent.mockResolvedValue({ event: { id: 'e1' }, myRegistration: { status: 'Confirmed' } });

    const res = await slugRoute.GET(req('GET', `/api/events/${SLUG}`), params);

    expect(res.status).toBe(200);
    expect(eventService.getPublicEvent).toHaveBeenCalledWith({ slug: SLUG, viewerId: 'u1' });
  });

  it('GET /api/me/events returns the caller\'s registrations', async () => {
    eventService.getMyEvents.mockResolvedValue([{ id: 'r1' }]);

    const res = await meRoute.GET(req('GET', '/api/me/events'));

    expect(await res.json()).toEqual({ success: true, registrations: [{ id: 'r1' }] });
    expect(eventService.getMyEvents).toHaveBeenCalledWith('u1');
  });

  it('GET /api/tutor/events returns the tutor\'s events', async () => {
    eventService.getTutorEvents.mockResolvedValue([{ id: 'e1', confirmedCount: 3 }]);

    const res = await tutorRoute.GET(req('GET', '/api/tutor/events'));

    expect(await res.json()).toEqual({ success: true, events: [{ id: 'e1', confirmedCount: 3 }] });
    expect(eventService.getTutorEvents).toHaveBeenCalledWith('t1');
  });
});
