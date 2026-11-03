/**
 * @jest-environment node
 *
 * Routes under /api/admin/manual-sessions: every one is admin-only, validates
 * its input, and maps the service's business codes to HTTP without leaking
 * internal errors. The service is mocked (see manual-session.service.test.js).
 */

jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/services/manual-session.service', () => ({
  listManualSessions: jest.fn(),
  listTutorsForCourse: jest.fn(),
  getTutorAvailability: jest.fn(),
  createManualSession: jest.fn(),
  generatePaymentProofUploadUrl: jest.fn(),
  attachPaymentProof: jest.fn(),
  getPaymentProofUrl: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/manual-session.service');
const root = require('@/app/api/admin/manual-sessions/route');
const tutors = require('@/app/api/admin/manual-sessions/tutors/route');
const availability = require('@/app/api/admin/manual-sessions/availability/route');
const proof = require('@/app/api/admin/manual-sessions/[sessionId]/payment-proof/route');
const presigned = require('@/app/api/admin/manual-sessions/[sessionId]/payment-proof/presigned-url/route');

const BASE = 'http://localhost/api/admin/manual-sessions';
const UUID = '11111111-1111-4111-8111-111111111111';
const params = (sessionId = UUID) => ({ params: Promise.resolve({ sessionId }) });

function request(path = '', { method = 'GET', body } = {}) {
  return new Request(`${BASE}${path}`, {
    method,
    ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

function validBody(overrides = {}) {
  return {
    tutorId: UUID,
    courseId: UUID,
    student: { phoneNumber: '+57 300 123 4567', email: 'Alguien@Gmail.com' },
    startTimestamp: '2026-11-02T15:00:00.000Z',
    durationMinutes: 60,
    ...overrides,
  };
}

const coded = (code) => Object.assign(new Error(code), { code });

const ROUTES = [
  ['GET /', () => root.GET(request())],
  ['POST /', () => root.POST(request('', { method: 'POST', body: validBody() }))],
  ['GET /tutors', () => tutors.GET(request(`/tutors?courseId=${UUID}`))],
  ['GET /availability', () => availability.GET(request(`/availability?tutorId=${UUID}`))],
  ['POST /:id/payment-proof', () => proof.POST(request(`/${UUID}/payment-proof`, { method: 'POST', body: { s3Key: 'k' } }), params())],
  ['GET /:id/payment-proof', () => proof.GET(request(`/${UUID}/payment-proof`), params())],
  ['POST /:id/payment-proof/presigned-url', () => presigned.POST(
    request(`/${UUID}/payment-proof/presigned-url`, { method: 'POST', body: { mimeType: 'image/png', fileSize: 10 } }),
    params(),
  )],
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('authorization', () => {
  it.each(ROUTES)('test_should_answer_401_on_%s_without_a_session', async (_name, call) => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ error: 'Missing' }, { status: 401 }));

    const res = await call();

    expect(res.status).toBe(401);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('test_should_answer_403_on_%s_for_a_non_admin', async (_name, call) => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await call();

    expect(res.status).toBe(403);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/manual-sessions', () => {
  it('test_should_take_the_admin_from_the_session_and_answer_201', async () => {
    service.createManualSession.mockResolvedValue({ session: { id: UUID }, emails: { student: true, tutor: true } });

    const res = await root.POST(request('', { method: 'POST', body: validBody({ adminId: 'attacker' }) }));

    expect(res.status).toBe(201);
    expect(service.createManualSession).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1' }));
  });

  it('test_should_not_pass_any_amount_status_or_name_to_the_service', async () => {
    service.createManualSession.mockResolvedValue({ session: { id: UUID } });

    await root.POST(request('', {
      method: 'POST',
      body: validBody({ amount: 1, paymentStatus: 'paid', student: { name: 'X', phoneNumber: '+57 300 123 4567', email: 'a@b.co' } }),
    }));

    const received = service.createManualSession.mock.calls[0][0];
    expect(received).not.toHaveProperty('amount');
    expect(received).not.toHaveProperty('paymentStatus');
    expect(received.student).toEqual({ phoneNumber: '+57 300 123 4567', email: 'a@b.co' });
  });

  it('test_should_normalise_the_email', async () => {
    service.createManualSession.mockResolvedValue({ session: { id: UUID } });

    await root.POST(request('', { method: 'POST', body: validBody() }));

    expect(service.createManualSession.mock.calls[0][0].student.email).toBe('alguien@gmail.com');
  });

  it.each([
    ['no email', { student: { phoneNumber: '+57 300 123 4567' } }],
    ['an invalid email', { student: { phoneNumber: '+57 300 123 4567', email: 'nope' } }],
    ['no phone', { student: { email: 'a@b.co' } }],
    ['a tutor that is not a uuid', { tutorId: 'x' }],
    ['a duration not offered', { durationMinutes: 45 }],
    ['a start that is not a date', { startTimestamp: 'mañana' }],
  ])('test_should_answer_422_with_%s', async (_label, overrides) => {
    const res = await root.POST(request('', { method: 'POST', body: validBody(overrides) }));

    expect(res.status).toBe(422);
    expect(service.createManualSession).not.toHaveBeenCalled();
  });

  it('test_should_answer_422_on_a_malformed_body', async () => {
    const res = await root.POST(request('', { method: 'POST', body: '{not json' }));

    expect(res.status).toBe(422);
  });

  it.each([
    ['SLOT_NOT_AVAILABLE', 409],
    ['SESSION_CONFLICT', 409],
    ['STUDENT_CONTACT_CONFLICT', 409],
    ['COURSE_NOT_OFFERED', 400],
    ['NO_PRICE', 400],
    ['SELF_BOOKING', 400],
  ])('test_should_map_%s_to_%i', async (code, status) => {
    service.createManualSession.mockRejectedValue(coded(code));

    const res = await root.POST(request('', { method: 'POST', body: validBody() }));

    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(code);
  });

  it('test_should_not_leak_an_unexpected_error', async () => {
    service.createManualSession.mockRejectedValue(new Error('connection to db at 10.0.0.1 failed'));

    const res = await root.POST(request('', { method: 'POST', body: validBody() }));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});

describe('GET /api/admin/manual-sessions', () => {
  it('test_should_clamp_an_invalid_page', async () => {
    service.listManualSessions.mockResolvedValue({ sessions: [], total: 0 });

    const res = await root.GET(request('?limit=9999&offset=-4'));

    expect(res.status).toBe(200);
    expect(service.listManualSessions).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });
});

describe('form options', () => {
  it('test_should_answer_422_on_tutors_without_a_valid_course', async () => {
    const res = await tutors.GET(request('/tutors?courseId=nope'));

    expect(res.status).toBe(422);
    expect(service.listTutorsForCourse).not.toHaveBeenCalled();
  });

  it('test_should_list_the_tutors_of_the_course', async () => {
    service.listTutorsForCourse.mockResolvedValue([{ id: UUID, name: 'Laura' }]);

    const res = await tutors.GET(request(`/tutors?courseId=${UUID}`));

    expect((await res.json()).tutors).toEqual([{ id: UUID, name: 'Laura' }]);
    expect(service.listTutorsForCourse).toHaveBeenCalledWith(UUID);
  });

  it('test_should_answer_422_on_availability_without_a_valid_tutor', async () => {
    const res = await availability.GET(request('/availability'));

    expect(res.status).toBe(422);
  });

  it('test_should_return_the_days_of_the_tutor', async () => {
    const days = [{ date: '2026-11-02', slots: [] }];
    service.getTutorAvailability.mockResolvedValue({ timeZone: 'America/Bogota', bufferMinutes: 15, days });

    const res = await availability.GET(request(`/availability?tutorId=${UUID}`));

    expect(await res.json()).toEqual({ success: true, timeZone: 'America/Bogota', days });
  });
});

describe('payment proof', () => {
  it('test_should_answer_422_on_a_session_id_that_is_not_a_uuid', async () => {
    const res = await proof.POST(request('/x/payment-proof', { method: 'POST', body: { s3Key: 'k' } }), params('x'));

    expect(res.status).toBe(422);
    expect(service.attachPaymentProof).not.toHaveBeenCalled();
  });

  it('test_should_answer_422_without_a_key', async () => {
    const res = await proof.POST(request(`/${UUID}/payment-proof`, { method: 'POST', body: {} }), params());

    expect(res.status).toBe(422);
  });

  it('test_should_register_the_proof_as_the_authenticated_admin', async () => {
    service.attachPaymentProof.mockResolvedValue({ id: UUID, payment: { status: 'paid' } });

    const res = await proof.POST(
      request(`/${UUID}/payment-proof`, { method: 'POST', body: { s3Key: 'k', adminId: 'attacker' } }),
      params(),
    );

    expect((await res.json()).session.payment.status).toBe('paid');
    expect(service.attachPaymentProof).toHaveBeenCalledWith(expect.objectContaining({ sessionId: UUID, s3Key: 'k', adminId: 'admin-1' }));
  });

  it.each([
    ['PAYMENT_NOT_FOUND', 404],
    ['PAYMENT_ALREADY_PAID', 409],
    ['SESSION_NOT_PAYABLE', 409],
    ['PROOF_KEY_INVALID', 400],
    ['PROOF_NOT_UPLOADED', 400],
  ])('test_should_map_%s_to_%i_when_registering', async (code, status) => {
    service.attachPaymentProof.mockRejectedValue(coded(code));

    const res = await proof.POST(request(`/${UUID}/payment-proof`, { method: 'POST', body: { s3Key: 'k' } }), params());

    expect(res.status).toBe(status);
  });

  it('test_should_answer_404_when_viewing_a_session_without_proof', async () => {
    service.getPaymentProofUrl.mockRejectedValue(coded('PROOF_NOT_FOUND'));

    const res = await proof.GET(request(`/${UUID}/payment-proof`), params());

    expect(res.status).toBe(404);
  });

  it('test_should_answer_422_on_a_presign_without_size', async () => {
    const res = await presigned.POST(
      request(`/${UUID}/payment-proof/presigned-url`, { method: 'POST', body: { mimeType: 'image/png' } }),
      params(),
    );

    expect(res.status).toBe(422);
    expect(service.generatePaymentProofUploadUrl).not.toHaveBeenCalled();
  });

  it('test_should_map_a_file_type_refused_by_the_service_to_400', async () => {
    service.generatePaymentProofUploadUrl.mockRejectedValue(coded('PROOF_INVALID_TYPE'));

    const res = await presigned.POST(
      request(`/${UUID}/payment-proof/presigned-url`, { method: 'POST', body: { mimeType: 'text/html', fileSize: 10 } }),
      params(),
    );

    expect(res.status).toBe(400);
  });
});
