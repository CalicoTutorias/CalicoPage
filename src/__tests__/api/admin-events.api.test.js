/**
 * @jest-environment node
 *
 * Admin event routes: guard, validation, and service error mapping.
 *   GET/POST          /api/admin/events
 *   GET/PATCH/DELETE  /api/admin/events/[id]
 *   POST              /api/admin/events/[id]/publish
 *   POST              /api/admin/events/[id]/cancel
 *   POST              /api/admin/events/image/presigned-url
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/event-admin.service', () => ({
  listEventsAdmin: jest.fn(),
  getEventAdmin: jest.fn(),
  createEvent: jest.fn(),
  updateEvent: jest.fn(),
  publishEvent: jest.fn(),
  cancelEvent: jest.fn(),
  deleteDraftEvent: jest.fn(),
  listRegistrationsAdmin: jest.fn(),
  registrationsCsv: jest.fn(),
  getEventPaymentsAdmin: jest.fn(),
  markPaymentRefunded: jest.fn(),
  getSurveyResultsAdmin: jest.fn(),
  listTutorPayouts: jest.fn(),
  createTutorPayout: jest.fn(),
}));
jest.mock('@/lib/services/event-image.service', () => ({
  generateEventImageUploadUrl: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/event-admin.service');
const imageService = require('@/lib/services/event-image.service');
const listRoute = require('@/app/api/admin/events/route');
const idRoute = require('@/app/api/admin/events/[id]/route');
const publishRoute = require('@/app/api/admin/events/[id]/publish/route');
const cancelRoute = require('@/app/api/admin/events/[id]/cancel/route');
const imageRoute = require('@/app/api/admin/events/image/presigned-url/route');

const ID = '3f4c8d6a-1b2c-4d5e-8f90-123456789abc';
const TUTOR = '11111111-1111-4111-8111-111111111111';

function req(method, url, body) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const params = { params: Promise.resolve({ id: ID }) };
const serviceError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

const valid = {
  title: 'Repaso Cálculo',
  description: 'Repaso del primer parcial',
  tutorIds: [TUTOR],
  startsAt: '2026-10-18T23:00:00.000Z',
  endsAt: '2026-10-19T01:00:00.000Z',
  modality: 'Virtual',
  autoMeet: true,
  price: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

describe('guard', () => {
  it('refuses non-admins on every verb', async () => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));

    expect((await listRoute.GET(req('GET', '/api/admin/events'))).status).toBe(403);
    expect((await listRoute.POST(req('POST', '/api/admin/events', valid))).status).toBe(403);
    expect((await idRoute.GET(req('GET', `/api/admin/events/${ID}`), params)).status).toBe(403);
    expect((await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, { title: 'Nuevo' }), params)).status).toBe(403);
    expect((await idRoute.DELETE(req('DELETE', `/api/admin/events/${ID}`), params)).status).toBe(403);
    expect((await publishRoute.POST(req('POST', `/api/admin/events/${ID}/publish`), params)).status).toBe(403);
    expect((await cancelRoute.POST(req('POST', `/api/admin/events/${ID}/cancel`, {}), params)).status).toBe(403);
    expect((await imageRoute.POST(req('POST', '/api/admin/events/image/presigned-url', { mimeType: 'image/png', fileSize: 10 }))).status).toBe(403);

    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    expect(imageService.generateEventImageUploadUrl).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/events', () => {
  it('lists with the filter (default all)', async () => {
    service.listEventsAdmin.mockResolvedValue([{ id: ID }]);

    const res = await listRoute.GET(req('GET', '/api/admin/events?filter=finished'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, events: [{ id: ID }] });
    expect(service.listEventsAdmin).toHaveBeenCalledWith({ filter: 'finished' });

    await listRoute.GET(req('GET', '/api/admin/events'));
    expect(service.listEventsAdmin).toHaveBeenLastCalledWith({ filter: 'all' });
  });

  it('rejects an unknown filter', async () => {
    const res = await listRoute.GET(req('GET', '/api/admin/events?filter=weird'));
    expect(res.status).toBe(400);
    expect(service.listEventsAdmin).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/events', () => {
  it('creates with the admin from the guard, never from the body', async () => {
    service.createEvent.mockResolvedValue({ id: ID });
    const res = await listRoute.POST(req('POST', '/api/admin/events', { ...valid, createdById: 'someone-else' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, event: { id: ID } });
    const arg = service.createEvent.mock.calls[0][0];
    expect(arg.adminId).toBe('admin-1');
    expect(arg.data.createdById).toBeUndefined();
    expect(arg.data).toMatchObject({
      title: 'Repaso Cálculo', tutorIds: [TUTOR], modality: 'Virtual', autoMeet: true, price: 0,
      courseId: null, meetingUrl: null, location: null, isListed: true,
    });
  });

  it('keeps null / empty early-bird fields as null (not 0)', async () => {
    service.createEvent.mockResolvedValue({ id: ID });
    await listRoute.POST(req('POST', '/api/admin/events', valid));
    await listRoute.POST(req('POST', '/api/admin/events', { ...valid, earlyBirdSlots: null, earlyBirdPercent: '' }));
    await listRoute.POST(req('POST', '/api/admin/events', { ...valid, price: 20000, earlyBirdSlots: '5', earlyBirdPercent: 10 }));

    expect(service.createEvent.mock.calls[0][0].data).toMatchObject({ earlyBirdSlots: null, earlyBirdPercent: null });
    expect(service.createEvent.mock.calls[1][0].data).toMatchObject({ earlyBirdSlots: null, earlyBirdPercent: null });
    expect(service.createEvent.mock.calls[2][0].data).toMatchObject({ earlyBirdSlots: 5, earlyBirdPercent: 10 });
  });

  it.each([
    ['a bad modality', { ...valid, modality: 'Hybrid' }],
    ['a negative price', { ...valid, price: -1 }],
    ['an empty tutorIds', { ...valid, tutorIds: [] }],
    ['a non-https meeting link', { ...valid, autoMeet: false, meetingUrl: 'http://zoom.us/j/1' }],
    ['a cover key outside the events prefix', { ...valid, coverImageKey: 'news-images/a.png' }],
    ['an empty price (must not become a free event)', { ...valid, price: '' }],
    ['a null price', { ...valid, price: null }],
    ['a missing price', (({ price, ...rest }) => rest)(valid)],
    ['duplicate tutorIds', { ...valid, tutorIds: [TUTOR, TUTOR] }],
  ])('400s on %s', async (_label, body) => {
    const res = await listRoute.POST(req('POST', '/api/admin/events', body));
    expect(res.status).toBe(400);
    expect(service.createEvent).not.toHaveBeenCalled();
  });

  it('accepts a numeric-string price and a zero price', async () => {
    service.createEvent.mockResolvedValue({ id: ID });
    await listRoute.POST(req('POST', '/api/admin/events', { ...valid, price: '15000' }));
    await listRoute.POST(req('POST', '/api/admin/events', { ...valid, price: 0 }));
    expect(service.createEvent.mock.calls[0][0].data.price).toBe(15000);
    expect(service.createEvent.mock.calls[1][0].data.price).toBe(0);
  });

  it('maps a cover-image error to 400 on coverImageKey', async () => {
    service.createEvent.mockRejectedValue(serviceError('VALIDATION_ERROR', { rule: 'COVER_IMAGE_INVALID', field: 'coverImageKey' }));
    const res = await listRoute.POST(req('POST', '/api/admin/events', { ...valid, coverImageKey: 'event-images/a.png' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR', rule: 'COVER_IMAGE_INVALID', field: 'coverImageKey' });
  });

  it('maps a service validation error to 400 with its rule and field', async () => {
    service.createEvent.mockRejectedValue(serviceError('VALIDATION_ERROR', { rule: 'EARLY_BIRD_BELOW_MINIMUM', field: 'price' }));
    const res = await listRoute.POST(req('POST', '/api/admin/events', valid));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false, code: 'VALIDATION_ERROR', rule: 'EARLY_BIRD_BELOW_MINIMUM', field: 'price',
    });
  });

  it('hides unexpected errors behind a 500', async () => {
    service.createEvent.mockRejectedValue(new Error('db down'));
    const res = await listRoute.POST(req('POST', '/api/admin/events', valid));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'Error interno' });
  });
});

describe('/api/admin/events/[id]', () => {
  it('rejects a malformed id on every verb', async () => {
    const bad = { params: Promise.resolve({ id: 'not-a-uuid' }) };
    expect((await idRoute.GET(req('GET', '/x'), bad)).status).toBe(400);
    expect((await idRoute.PATCH(req('PATCH', '/x', { title: 'Nuevo' }), bad)).status).toBe(400);
    expect((await idRoute.DELETE(req('DELETE', '/x'), bad)).status).toBe(400);
    expect((await publishRoute.POST(req('POST', '/x'), bad)).status).toBe(400);
    expect((await cancelRoute.POST(req('POST', '/x', {}), bad)).status).toBe(400);
    Object.values(service).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it('GET returns the event and 404s an unknown one', async () => {
    service.getEventAdmin.mockResolvedValue({ id: ID });
    const res = await idRoute.GET(req('GET', `/api/admin/events/${ID}`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: { id: ID } });
    expect(service.getEventAdmin).toHaveBeenCalledWith(ID);

    service.getEventAdmin.mockRejectedValue(serviceError('NOT_FOUND'));
    expect((await idRoute.GET(req('GET', `/api/admin/events/${ID}`), params)).status).toBe(404);
  });

  it('PATCH forwards a partial update and passes calendarWarning through', async () => {
    service.updateEvent.mockResolvedValue({ event: { id: ID }, calendarWarning: true });
    const res = await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, { startsAt: '2026-10-20T23:00:00.000Z' }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: { id: ID }, calendarWarning: true });
    expect(service.updateEvent).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', id: ID, data: { startsAt: '2026-10-20T23:00:00.000Z' },
    }));
  });

  it('PATCH 400s an empty body', async () => {
    const res = await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, {}), params);
    expect(res.status).toBe(400);
    expect(service.updateEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['an explicit empty price', { price: '' }],
    ['an explicit null price', { price: null }],
    ['duplicate tutorIds', { tutorIds: [TUTOR, TUTOR] }],
  ])('PATCH 400s %s', async (_label, body) => {
    const res = await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, body), params);
    expect(res.status).toBe(400);
    expect(service.updateEvent).not.toHaveBeenCalled();
  });

  it('PATCH without a price leaves it out (unchanged)', async () => {
    service.updateEvent.mockResolvedValue({ event: { id: ID } });
    await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, { title: 'Nuevo título' }), params);
    expect(service.updateEvent.mock.calls[0][0].data).toEqual({ title: 'Nuevo título' });
  });

  it('PATCH maps PRICE_LOCKED and INVALID_STATE to 409', async () => {
    service.updateEvent.mockRejectedValueOnce(serviceError('PRICE_LOCKED'));
    const locked = await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, { price: 20000 }), params);
    expect(locked.status).toBe(409);
    expect(await locked.json()).toMatchObject({ success: false, code: 'PRICE_LOCKED' });

    service.updateEvent.mockRejectedValueOnce(serviceError('INVALID_STATE'));
    expect((await idRoute.PATCH(req('PATCH', `/api/admin/events/${ID}`, { modality: 'InPerson' }), params)).status).toBe(409);
  });

  it('DELETE removes a draft with the guard admin', async () => {
    service.deleteDraftEvent.mockResolvedValue({ id: ID });
    const res = await idRoute.DELETE(req('DELETE', `/api/admin/events/${ID}`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(service.deleteDraftEvent).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', id: ID }));
  });
});

describe('POST /api/admin/events/[id]/publish', () => {
  it('publishes and maps CALENDAR_ERROR to 502', async () => {
    service.publishEvent.mockResolvedValueOnce({ id: ID, status: 'Published' });
    const ok = await publishRoute.POST(req('POST', `/api/admin/events/${ID}/publish`), params);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ success: true, event: { id: ID, status: 'Published' } });
    expect(service.publishEvent).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', id: ID }));

    service.publishEvent.mockRejectedValueOnce(serviceError('CALENDAR_ERROR'));
    const failed = await publishRoute.POST(req('POST', `/api/admin/events/${ID}/publish`), params);
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ success: false, code: 'CALENDAR_ERROR' });
  });
});

describe('POST /api/admin/events/[id]/cancel', () => {
  it('forwards the reason', async () => {
    service.cancelEvent.mockResolvedValue({ id: ID, status: 'Canceled' });
    const res = await cancelRoute.POST(req('POST', `/api/admin/events/${ID}/cancel`, { reason: 'Tutor enfermo' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, event: { id: ID, status: 'Canceled' } });
    expect(service.cancelEvent).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', id: ID, reason: 'Tutor enfermo',
    }));
  });

  it('accepts a request without a body', async () => {
    service.cancelEvent.mockResolvedValue({ id: ID, status: 'Canceled' });
    const res = await cancelRoute.POST(req('POST', `/api/admin/events/${ID}/cancel`), params);
    expect(res.status).toBe(200);
    expect(service.cancelEvent.mock.calls[0][0].reason).toBeUndefined();
  });

  it('400s a reason over 300 characters', async () => {
    const res = await cancelRoute.POST(req('POST', `/api/admin/events/${ID}/cancel`, { reason: 'x'.repeat(301) }), params);
    expect(res.status).toBe(400);
    expect(service.cancelEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/events/image/presigned-url', () => {
  it('returns the upload URL and key', async () => {
    imageService.generateEventImageUploadUrl.mockResolvedValue({ uploadUrl: 'https://s3/put', s3Key: 'event-images/a.png' });
    const res = await imageRoute.POST(req('POST', '/api/admin/events/image/presigned-url', { mimeType: 'image/png', fileSize: 1024 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, uploadUrl: 'https://s3/put', s3Key: 'event-images/a.png' });
    expect(imageService.generateEventImageUploadUrl).toHaveBeenCalledWith({ mimeType: 'image/png', fileSize: 1024 });
  });

  it('400s an unsupported type or an oversized file', async () => {
    expect((await imageRoute.POST(req('POST', '/x', { mimeType: 'image/gif', fileSize: 10 }))).status).toBe(400);
    expect((await imageRoute.POST(req('POST', '/x', { mimeType: 'image/png', fileSize: 6 * 1024 * 1024 }))).status).toBe(400);
    expect(imageService.generateEventImageUploadUrl).not.toHaveBeenCalled();
  });
});

// ─── registrations, payments, survey, payouts ─────────────────────────────

const registrationsRoute = require('@/app/api/admin/events/[id]/registrations/route');
const paymentsRoute = require('@/app/api/admin/events/[id]/payments/route');
const refundedRoute = require('@/app/api/admin/events/[id]/payments/[paymentId]/refunded/route');
const surveyRoute = require('@/app/api/admin/events/[id]/survey/route');
const payoutsRoute = require('@/app/api/admin/events/[id]/tutor-payouts/route');

const PAYMENT = '22222222-2222-4222-8222-222222222222';
const payParams = { params: Promise.resolve({ id: ID, paymentId: PAYMENT }) };
const payoutBody = { tutorId: TUTOR, amount: 5000, paidAt: '2026-10-20T15:00:00.000Z' };

describe('admin ops routes: guard and ids', () => {
  it('refuse non-admins', async () => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 }));
    const base = `/api/admin/events/${ID}`;
    expect((await registrationsRoute.GET(req('GET', `${base}/registrations`), params)).status).toBe(403);
    expect((await paymentsRoute.GET(req('GET', `${base}/payments`), params)).status).toBe(403);
    expect((await refundedRoute.POST(req('POST', `${base}/payments/${PAYMENT}/refunded`), payParams)).status).toBe(403);
    expect((await surveyRoute.GET(req('GET', `${base}/survey`), params)).status).toBe(403);
    expect((await payoutsRoute.GET(req('GET', `${base}/tutor-payouts`), params)).status).toBe(403);
    expect((await payoutsRoute.POST(req('POST', `${base}/tutor-payouts`, payoutBody), params)).status).toBe(403);
    expect(service.listRegistrationsAdmin).not.toHaveBeenCalled();
    expect(service.createTutorPayout).not.toHaveBeenCalled();
  });

  it('400 on malformed ids', async () => {
    const bad = { params: Promise.resolve({ id: 'nope', paymentId: PAYMENT }) };
    expect((await registrationsRoute.GET(req('GET', '/x'), bad)).status).toBe(400);
    expect((await refundedRoute.POST(req('POST', '/x'), { params: Promise.resolve({ id: ID, paymentId: 'nope' }) })).status).toBe(400);
    expect(service.markPaymentRefunded).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/events/[id]/registrations', () => {
  it('returns JSON rows', async () => {
    service.listRegistrationsAdmin.mockResolvedValue([{ id: 'r1' }]);
    const res = await registrationsRoute.GET(req('GET', `/api/admin/events/${ID}/registrations`), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, registrations: [{ id: 'r1' }] });
  });

  it('returns a CSV attachment with ?format=csv', async () => {
    service.listRegistrationsAdmin.mockResolvedValue([{ id: 'r1' }]);
    service.getEventAdmin.mockResolvedValue({ slug: 'repaso-ab12' });
    service.registrationsCsv.mockReturnValue('﻿Nombre\r\nAna');
    const res = await registrationsRoute.GET(req('GET', `/api/admin/events/${ID}/registrations?format=csv`), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="inscritos-repaso-ab12.csv"');
    expect(await res.text()).toContain('Ana');
  });

  it('maps NOT_FOUND to 404', async () => {
    service.listRegistrationsAdmin.mockRejectedValue(serviceError('NOT_FOUND'));
    expect((await registrationsRoute.GET(req('GET', '/x'), params)).status).toBe(404);
  });
});

describe('payments, refund, survey', () => {
  it('payments returns list and totals', async () => {
    service.getEventPaymentsAdmin.mockResolvedValue({ payments: [{ id: 'p' }], totals: { gross: 1 } });
    const res = await paymentsRoute.GET(req('GET', '/x'), params);
    expect(await res.json()).toEqual({ success: true, payments: [{ id: 'p' }], totals: { gross: 1 } });
  });

  it('refunded passes the admin and ids; INVALID_STATE is 409', async () => {
    service.markPaymentRefunded.mockResolvedValue({ id: PAYMENT, refundStatus: 'Refunded' });
    const res = await refundedRoute.POST(req('POST', '/x'), payParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, payment: { id: PAYMENT, refundStatus: 'Refunded' } });
    expect(service.markPaymentRefunded).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', eventId: ID, paymentId: PAYMENT }));

    service.markPaymentRefunded.mockRejectedValue(serviceError('INVALID_STATE'));
    expect((await refundedRoute.POST(req('POST', '/x'), payParams)).status).toBe(409);
  });

  it('survey returns results', async () => {
    service.getSurveyResultsAdmin.mockResolvedValue({ responseRate: 0 });
    expect(await (await surveyRoute.GET(req('GET', '/x'), params)).json()).toEqual({ success: true, results: { responseRate: 0 } });
  });
});

describe('tutor-payouts', () => {
  const url = `/api/admin/events/${ID}/tutor-payouts`;

  it('GET lists payouts', async () => {
    service.listTutorPayouts.mockResolvedValue([{ id: 'x' }]);
    expect(await (await payoutsRoute.GET(req('GET', url), params)).json()).toEqual({ success: true, payouts: [{ id: 'x' }] });
  });

  it('POST creates (201)', async () => {
    service.createTutorPayout.mockResolvedValue({ id: 'x' });
    const res = await payoutsRoute.POST(req('POST', url, { ...payoutBody, note: 'Nequi' }), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, payout: { id: 'x' } });
    expect(service.createTutorPayout).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', eventId: ID, ...payoutBody, note: 'Nequi' }));
  });

  it.each([
    ['non-integer amount', { amount: 10.5 }],
    ['zero amount', { amount: 0 }],
    ['string amount', { amount: '5000' }],
    ['bad tutor id', { tutorId: 'x' }],
    ['bad date', { paidAt: 'yesterday' }],
    ['long note', { note: 'x'.repeat(301) }],
  ])('POST 400s %s', async (_n, patch) => {
    const res = await payoutsRoute.POST(req('POST', url, { ...payoutBody, ...patch }), params);
    expect(res.status).toBe(400);
    expect(service.createTutorPayout).not.toHaveBeenCalled();
  });

  it('POST maps a foreign tutor to 400 with its rule', async () => {
    service.createTutorPayout.mockRejectedValue(serviceError('VALIDATION_ERROR', { rule: 'NOT_EVENT_TUTOR', field: 'tutorId' }));
    const res = await payoutsRoute.POST(req('POST', url, payoutBody), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR', rule: 'NOT_EVENT_TUTOR' });
  });
});
