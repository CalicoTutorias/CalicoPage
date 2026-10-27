/**
 * @jest-environment node
 *
 * Routes for approval events and study material: guard, validation, identity
 * from the JWT and service error mapping.
 *   POST   /api/admin/events/[id]/registrations/[registrationId]/{approve,reject}
 *   GET    /api/admin/events/[id]/materials · POST (register an upload)
 *   POST   /api/admin/events/[id]/materials/presigned-url
 *   DELETE /api/admin/events/[id]/materials/[materialId]
 *   GET    /api/events/[slug]/materials
 *   GET    /api/events/[slug]/materials/[materialId]/download
 */

jest.mock('@/lib/auth/guards', () => ({ requireAdminUser: jest.fn() }));
jest.mock('@/lib/auth/middleware', () => ({ authenticateRequest: jest.fn() }));
jest.mock('@/lib/auth/rateLimit', () => ({ rateLimit: jest.fn(() => null) }));
jest.mock('@/lib/services/event-admin.service', () => ({ reviewRegistration: jest.fn() }));
jest.mock('@/lib/services/event-material.service', () => ({
  listMaterialsAdmin: jest.fn(),
  registerMaterial: jest.fn(),
  generateMaterialUploadUrl: jest.fn(),
  deleteMaterial: jest.fn(),
  listMaterialsForStudent: jest.fn(),
  getMaterialDownloadUrl: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const { authenticateRequest } = require('@/lib/auth/middleware');
const { rateLimit } = require('@/lib/auth/rateLimit');
const adminService = require('@/lib/services/event-admin.service');
const materialService = require('@/lib/services/event-material.service');
const approveRoute = require('@/app/api/admin/events/[id]/registrations/[registrationId]/approve/route');
const rejectRoute = require('@/app/api/admin/events/[id]/registrations/[registrationId]/reject/route');
const materialsRoute = require('@/app/api/admin/events/[id]/materials/route');
const presignRoute = require('@/app/api/admin/events/[id]/materials/presigned-url/route');
const materialRoute = require('@/app/api/admin/events/[id]/materials/[materialId]/route');
const studentListRoute = require('@/app/api/events/[slug]/materials/route');
const downloadRoute = require('@/app/api/events/[slug]/materials/[materialId]/download/route');

const ID = '3f4c8d6a-1b2c-4d5e-8f90-123456789abc';
const REG = '11111111-1111-4111-8111-111111111111';
const MAT = '22222222-2222-4222-8222-222222222222';

function req(method, body) {
  return new Request('http://localhost/x', {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

const p = (values) => ({ params: Promise.resolve(values) });
const serviceError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });
const forbidden = () => NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
  authenticateRequest.mockResolvedValue({ sub: 'u1' });
});

afterEach(() => console.error.mockRestore());

describe('admin: approve / reject', () => {
  it('refuses non-admins and malformed ids', async () => {
    requireAdminUser.mockResolvedValueOnce(forbidden());
    expect((await approveRoute.POST(req('POST'), p({ id: ID, registrationId: REG }))).status).toBe(403);
    expect((await rejectRoute.POST(req('POST'), p({ id: ID, registrationId: 'nope' }))).status).toBe(400);
    expect(adminService.reviewRegistration).not.toHaveBeenCalled();
  });

  it('passes the admin from the JWT, the ids and the decision of the route', async () => {
    adminService.reviewRegistration.mockResolvedValue({ registration: { id: REG, status: 'Confirmed' }, emailSent: true });

    const res = await approveRoute.POST(req('POST'), p({ id: ID, registrationId: REG }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, registration: { id: REG, status: 'Confirmed' }, emailSent: true });
    expect(adminService.reviewRegistration).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', eventId: ID, registrationId: REG, decision: 'approve',
    }));

    await rejectRoute.POST(req('POST'), p({ id: ID, registrationId: REG }));
    expect(adminService.reviewRegistration).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'reject' }));
  });

  it('maps INVALID_STATE to 409 and NOT_FOUND to 404', async () => {
    adminService.reviewRegistration.mockRejectedValueOnce(serviceError('INVALID_STATE'));
    expect((await approveRoute.POST(req('POST'), p({ id: ID, registrationId: REG }))).status).toBe(409);
    adminService.reviewRegistration.mockRejectedValueOnce(serviceError('NOT_FOUND'));
    expect((await rejectRoute.POST(req('POST'), p({ id: ID, registrationId: REG }))).status).toBe(404);
  });
});

describe('admin: materials', () => {
  it('refuses non-admins on every verb', async () => {
    requireAdminUser.mockResolvedValue(forbidden());
    expect((await materialsRoute.GET(req('GET'), p({ id: ID }))).status).toBe(403);
    expect((await materialsRoute.POST(req('POST', { s3Key: 'k', fileName: 'a.pdf' }), p({ id: ID }))).status).toBe(403);
    expect((await presignRoute.POST(req('POST', { fileName: 'a.pdf', fileSize: 1 }), p({ id: ID }))).status).toBe(403);
    expect((await materialRoute.DELETE(req('DELETE'), p({ id: ID, materialId: MAT }))).status).toBe(403);
  });

  it('presign validates the body and passes it on', async () => {
    expect((await presignRoute.POST(req('POST', { fileName: 'a.pdf' }), p({ id: ID }))).status).toBe(400);
    expect((await presignRoute.POST(req('POST', 'not json'), p({ id: ID }))).status).toBe(400);
    expect(materialService.generateMaterialUploadUrl).not.toHaveBeenCalled();

    materialService.generateMaterialUploadUrl.mockResolvedValue({ uploadUrl: 'u', s3Key: 'k', contentType: 'application/pdf' });
    const res = await presignRoute.POST(req('POST', { fileName: 'a.pdf', fileSize: 10 }), p({ id: ID }));
    expect(await res.json()).toEqual({ success: true, uploadUrl: 'u', s3Key: 'k', contentType: 'application/pdf' });
    expect(materialService.generateMaterialUploadUrl).toHaveBeenCalledWith({ eventId: ID, fileName: 'a.pdf', fileSize: 10 });
  });

  it('a VALIDATION_ERROR keeps its rule (400)', async () => {
    materialService.generateMaterialUploadUrl.mockRejectedValue(serviceError('VALIDATION_ERROR', { rule: 'MATERIAL_TYPE_INVALID', field: 'fileName' }));
    const res = await presignRoute.POST(req('POST', { fileName: 'a.exe', fileSize: 10 }), p({ id: ID }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR', rule: 'MATERIAL_TYPE_INVALID', field: 'fileName' });
  });

  it('register answers 201 with the admin from the JWT; list and delete pass the ids', async () => {
    materialService.registerMaterial.mockResolvedValue({ id: MAT });
    const created = await materialsRoute.POST(req('POST', { s3Key: 'k', fileName: 'a.pdf', adminId: 'evil' }), p({ id: ID }));
    expect(created.status).toBe(201);
    expect(materialService.registerMaterial).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', eventId: ID, s3Key: 'k', fileName: 'a.pdf',
    }));

    materialService.listMaterialsAdmin.mockResolvedValue([{ id: MAT }]);
    const list = await materialsRoute.GET(req('GET'), p({ id: ID }));
    expect(await list.json()).toEqual({ success: true, materials: [{ id: MAT }] });
    expect(list.headers.get('Cache-Control')).toBe('private, no-store');

    materialService.deleteMaterial.mockResolvedValue({ id: MAT });
    expect((await materialRoute.DELETE(req('DELETE'), p({ id: ID, materialId: MAT }))).status).toBe(200);
    expect(materialService.deleteMaterial).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin-1', eventId: ID, materialId: MAT }));
    expect((await materialRoute.DELETE(req('DELETE'), p({ id: ID, materialId: 'nope' }))).status).toBe(400);
  });
});

describe('student: materials', () => {
  it('requires a session', async () => {
    authenticateRequest.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await studentListRoute.GET(req('GET'), p({ slug: 'repaso' }))).status).toBe(401);
    expect((await downloadRoute.GET(req('GET'), p({ slug: 'repaso', materialId: MAT }))).status).toBe(401);
    expect(materialService.listMaterialsForStudent).not.toHaveBeenCalled();
  });

  it('uses auth.sub and never caches', async () => {
    materialService.listMaterialsForStudent.mockResolvedValue([{ id: MAT, fileName: 'guia.pdf' }]);
    const res = await studentListRoute.GET(req('GET'), p({ slug: 'repaso' }));
    expect(await res.json()).toEqual({ success: true, materials: [{ id: MAT, fileName: 'guia.pdf' }] });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(materialService.listMaterialsForStudent).toHaveBeenCalledWith({ slug: 'repaso', userId: 'u1' });

    materialService.getMaterialDownloadUrl.mockResolvedValue({ url: 'https://s3/get', fileName: 'guia.pdf' });
    const dl = await downloadRoute.GET(req('GET'), p({ slug: 'repaso', materialId: MAT }));
    expect(await dl.json()).toEqual({ success: true, url: 'https://s3/get', fileName: 'guia.pdf' });
    expect(materialService.getMaterialDownloadUrl).toHaveBeenCalledWith({ slug: 'repaso', userId: 'u1', materialId: MAT });
    expect(rateLimit).toHaveBeenCalledWith('event-materials:u1', { max: 30, windowMs: 60_000 });
  });

  it.each([
    ['MATERIALS_LOCKED', 403],
    ['MATERIAL_NOT_FOUND', 404],
    ['EVENT_NOT_FOUND', 404],
  ])('%s → %i', async (code, status) => {
    materialService.getMaterialDownloadUrl.mockRejectedValue(serviceError(code));
    const res = await downloadRoute.GET(req('GET'), p({ slug: 'repaso', materialId: MAT }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ success: false, error: code });
  });

  it('an unexpected error is a 500 without details', async () => {
    materialService.listMaterialsForStudent.mockRejectedValue(new Error('S3 exploded with secret'));
    const res = await studentListRoute.GET(req('GET'), p({ slug: 'repaso' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: 'INTERNAL_ERROR' });
  });

  it('rate limited downloads answer the limiter response', async () => {
    rateLimit.mockReturnValueOnce(NextResponse.json({ success: false, error: 'RATE_LIMITED' }, { status: 429 }));
    expect((await downloadRoute.GET(req('GET'), p({ slug: 'repaso', materialId: MAT }))).status).toBe(429);
    expect(materialService.getMaterialDownloadUrl).not.toHaveBeenCalled();
  });
});
