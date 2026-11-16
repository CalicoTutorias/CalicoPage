/**
 * @jest-environment node
 *
 * Routes under /api/sessions/[id]/materials: identity comes from the JWT and the
 * role from the database, input is validated, and the service's business codes
 * map to HTTP without leaking internal errors. The service is mocked (see
 * session-material.service.test.js).
 */

jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/auth/guards', () => ({ isAdmin: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn() }));
jest.mock('@/lib/services/session-material.service', () => ({
  listMaterials: jest.fn(),
  registerMaterial: jest.fn(),
  generateUploadUrl: jest.fn(),
  deleteMaterial: jest.fn(),
  getMaterialDownloadUrl: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { isAdmin } = require('@/lib/auth/guards');
const { rateLimit } = require('@/lib/auth/rateLimit');
const service = require('@/lib/services/session-material.service');
const root = require('@/app/api/sessions/[id]/materials/route');
const presigned = require('@/app/api/sessions/[id]/materials/presigned-url/route');
const item = require('@/app/api/sessions/[id]/materials/[materialId]/route');
const download = require('@/app/api/sessions/[id]/materials/[materialId]/download/route');

const UUID = '11111111-1111-4111-8111-111111111111';
const MATERIAL = '22222222-2222-4222-8222-222222222222';
const BASE = `http://localhost/api/sessions/${UUID}/materials`;
const params = (id = UUID, materialId = MATERIAL) => ({ params: Promise.resolve({ id, materialId }) });
const STUDENT_ACTOR = { id: 'user-1', isAdmin: false };

function request({ method = 'GET', body } = {}) {
  return new Request(BASE, { method, ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
}

const coded = (code) => Object.assign(new Error(code), { code });

const ROUTES = [
  ['GET /', () => root.GET(request(), params())],
  ['POST /', () => root.POST(request({ method: 'POST', body: { s3Key: 'k', fileName: 'a.pdf' } }), params())],
  ['POST /presigned-url', () => presigned.POST(request({ method: 'POST', body: { fileName: 'a.pdf', fileSize: 10 } }), params())],
  ['DELETE /:id', () => item.DELETE(request({ method: 'DELETE' }), params())],
  ['GET /:id/download', () => download.GET(request(), params())],
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  authenticateRequest.mockResolvedValue({ sub: 'user-1' });
  isAdmin.mockResolvedValue(false);
  rateLimit.mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('every route', () => {
  it.each(ROUTES)('test_should_answer_401_on_%s_without_a_session', async (_name, call) => {
    authenticateRequest.mockResolvedValue(NextResponse.json({ error: 'Missing' }, { status: 401 }));

    const res = await call();

    expect(res.status).toBe(401);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('test_should_answer_429_on_%s_when_rate_limited', async (_name, call) => {
    rateLimit.mockReturnValue(NextResponse.json({ error: 'Too many' }, { status: 429 }));

    const res = await call();

    expect(res.status).toBe(429);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('test_should_not_leak_an_unexpected_error_on_%s', async (_name, call) => {
    for (const fn of Object.values(service)) fn.mockRejectedValue(new Error('connection to db at 10.0.0.1 failed'));

    const res = await call();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Internal server error');
  });
});

describe('GET /materials', () => {
  it('test_should_take_the_user_from_the_jwt_and_the_role_from_the_database', async () => {
    isAdmin.mockResolvedValue(true);
    service.listMaterials.mockResolvedValue({ locked: false, count: 0, materials: [] });

    const res = await root.GET(request(), params());

    expect(res.status).toBe(200);
    expect(isAdmin).toHaveBeenCalledWith('user-1');
    expect(service.listMaterials).toHaveBeenCalledWith({ sessionId: UUID, actor: { id: 'user-1', isAdmin: true } });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('test_should_answer_422_on_a_session_id_that_is_not_a_uuid', async () => {
    const res = await root.GET(request(), params('x'));

    expect(res.status).toBe(422);
    expect(service.listMaterials).not.toHaveBeenCalled();
  });

  it.each([['FORBIDDEN', 403], ['SESSION_NOT_FOUND', 404]])('test_should_map_%s_to_%i', async (code, status) => {
    service.listMaterials.mockRejectedValue(coded(code));

    const res = await root.GET(request(), params());

    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(code);
  });
});

describe('POST /materials', () => {
  it('test_should_register_as_the_authenticated_user_and_answer_201', async () => {
    service.registerMaterial.mockResolvedValue({ id: 'm1' });

    const res = await root.POST(request({ method: 'POST', body: { s3Key: 'k', fileName: 'a.pdf', createdById: 'attacker' } }), params());

    expect(res.status).toBe(201);
    const received = service.registerMaterial.mock.calls[0][0];
    expect(received.actor).toEqual(STUDENT_ACTOR);
    expect(received).not.toHaveProperty('createdById');
  });

  it.each([
    ['no key', { fileName: 'a.pdf' }],
    ['no name', { s3Key: 'k' }],
    ['a malformed body', '{not json'],
  ])('test_should_answer_422_with_%s', async (_label, body) => {
    const res = await root.POST(request({ method: 'POST', body }), params());

    expect(res.status).toBe(422);
    expect(service.registerMaterial).not.toHaveBeenCalled();
  });

  it.each([
    ['MATERIAL_KEY_INVALID', 400],
    ['MATERIAL_NOT_UPLOADED', 400],
    ['MATERIAL_DUPLICATE', 409],
    ['MATERIAL_LIMIT', 409],
    ['SESSION_NOT_ELIGIBLE', 409],
  ])('test_should_map_%s_to_%i', async (code, status) => {
    service.registerMaterial.mockRejectedValue(coded(code));

    const res = await root.POST(request({ method: 'POST', body: { s3Key: 'k', fileName: 'a.pdf' } }), params());

    expect(res.status).toBe(status);
  });
});

describe('POST /materials/presigned-url', () => {
  it('test_should_pass_the_file_and_the_actor_to_the_service', async () => {
    service.generateUploadUrl.mockResolvedValue({ uploadUrl: 'u', s3Key: 'k', contentType: 'application/pdf' });

    const res = await presigned.POST(request({ method: 'POST', body: { fileName: 'a.pdf', fileSize: 10 } }), params());

    expect((await res.json()).uploadUrl).toBe('u');
    expect(service.generateUploadUrl).toHaveBeenCalledWith({ sessionId: UUID, actor: STUDENT_ACTOR, fileName: 'a.pdf', fileSize: 10 });
  });

  it.each([
    ['no size', { fileName: 'a.pdf' }],
    ['a size that is not a number', { fileName: 'a.pdf', fileSize: '10' }],
    ['a negative size', { fileName: 'a.pdf', fileSize: -1 }],
  ])('test_should_answer_422_with_%s', async (_label, body) => {
    const res = await presigned.POST(request({ method: 'POST', body }), params());

    expect(res.status).toBe(422);
  });

  it.each([['MATERIAL_TYPE_INVALID', 400], ['MATERIAL_TOO_LARGE', 400], ['FORBIDDEN', 403]])('test_should_map_%s_to_%i', async (code, status) => {
    service.generateUploadUrl.mockRejectedValue(coded(code));

    const res = await presigned.POST(request({ method: 'POST', body: { fileName: 'a.pdf', fileSize: 10 } }), params());

    expect(res.status).toBe(status);
  });
});

describe('DELETE /materials/:id', () => {
  it('test_should_answer_422_on_a_material_id_that_is_not_a_uuid', async () => {
    const res = await item.DELETE(request({ method: 'DELETE' }), params(UUID, 'x'));

    expect(res.status).toBe(422);
    expect(service.deleteMaterial).not.toHaveBeenCalled();
  });

  it('test_should_map_a_refusal_to_403', async () => {
    service.deleteMaterial.mockRejectedValue(coded('FORBIDDEN'));

    const res = await item.DELETE(request({ method: 'DELETE' }), params());

    expect(res.status).toBe(403);
  });
});

describe('GET /materials/:id/download', () => {
  it('test_should_answer_403_while_locked', async () => {
    service.getMaterialDownloadUrl.mockRejectedValue(coded('MATERIALS_LOCKED'));

    const res = await download.GET(request(), params());

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('MATERIALS_LOCKED');
  });

  it('test_should_return_the_url_without_caching_it', async () => {
    service.getMaterialDownloadUrl.mockResolvedValue({ url: 'https://s3.example/get', fileName: 'a.pdf' });

    const res = await download.GET(request(), params());

    expect(await res.json()).toEqual({ success: true, url: 'https://s3.example/get', fileName: 'a.pdf' });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(service.getMaterialDownloadUrl).toHaveBeenCalledWith({ sessionId: UUID, materialId: MATERIAL, actor: STUDENT_ACTOR });
  });

  it('test_should_map_a_missing_material_to_404', async () => {
    service.getMaterialDownloadUrl.mockRejectedValue(coded('MATERIAL_NOT_FOUND'));

    const res = await download.GET(request(), params());

    expect(res.status).toBe(404);
  });
});
