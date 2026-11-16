/**
 * @jest-environment node
 *
 * Admin course routes: guard, Zod validation, pagination params and service
 * error mapping.
 *   GET/POST/PATCH /api/admin/courses
 *   GET            /api/courses/[id]   (PUT/DELETE removed: unvalidated, unaudited)
 */

jest.mock('@/lib/auth/guards', () => ({
  requireAdminUser: jest.fn(),
}));
jest.mock('@/lib/services/course-management.service', () => ({
  listCoursesForAdmin: jest.fn(),
  createCourseAsAdmin: jest.fn(),
  updateCourseAsAdmin: jest.fn(),
}));
jest.mock('@/lib/services/academic.service', () => ({
  getCourseById: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const courseManagement = require('@/lib/services/course-management.service');
const route = require('@/app/api/admin/courses/route');
const courseByIdRoute = require('@/app/api/courses/[id]/route');

const COURSE_ID = '3f4c8d6a-1b2c-4d5e-8f90-123456789abc';
const CAREER_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function req(method, url, body) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue({ sub: 'admin-1', role: 'ADMIN' });
});

describe('guard', () => {
  it('refuses non-admins on every verb', async () => {
    requireAdminUser.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }));

    expect((await route.GET(req('GET', '/api/admin/courses'))).status).toBe(403);
    expect((await route.POST(req('POST', '/api/admin/courses', {}))).status).toBe(403);
    expect((await route.PATCH(req('PATCH', '/api/admin/courses', {}))).status).toBe(403);
    expect(courseManagement.listCoursesForAdmin).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/courses', () => {
  it('passes search and clamped pagination to the service', async () => {
    courseManagement.listCoursesForAdmin.mockResolvedValue({ courses: [{ id: COURSE_ID }], total: 41 });

    const res = await route.GET(req('GET', '/api/admin/courses?search=calculo&limit=500&offset=-3'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(courseManagement.listCoursesForAdmin).toHaveBeenCalledWith({ search: 'calculo', limit: 100, offset: 0 });
    expect(body).toMatchObject({ success: true, total: 41, courses: [{ id: COURSE_ID }] });
  });

  it('defaults to the first page of 20', async () => {
    courseManagement.listCoursesForAdmin.mockResolvedValue({ courses: [], total: 0 });

    await route.GET(req('GET', '/api/admin/courses'));

    expect(courseManagement.listCoursesForAdmin).toHaveBeenCalledWith({ search: '', limit: 20, offset: 0 });
  });
});

describe('POST /api/admin/courses', () => {
  const valid = { code: 'isis1001', name: 'Introducción', complexity: 'Introductory', basePrice: 40000, careerId: CAREER_ID };

  it('rejects a zero price (a course nobody could pay for)', async () => {
    const res = await route.POST(req('POST', '/api/admin/courses', { ...valid, basePrice: 0 }));
    expect(res.status).toBe(422);
    expect(courseManagement.createCourseAsAdmin).not.toHaveBeenCalled();
  });

  it('rejects codes with spaces', async () => {
    const res = await route.POST(req('POST', '/api/admin/courses', { ...valid, code: 'ISIS 1001' }));
    expect(res.status).toBe(422);
  });

  it('creates and maps a duplicate code to 409', async () => {
    courseManagement.createCourseAsAdmin.mockResolvedValueOnce({ id: COURSE_ID });
    expect((await route.POST(req('POST', '/api/admin/courses', valid))).status).toBe(201);

    courseManagement.createCourseAsAdmin.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await route.POST(req('POST', '/api/admin/courses', valid));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('COURSE_EXISTS');
  });
});

describe('PATCH /api/admin/courses', () => {
  it('forwards every editable field to the service', async () => {
    courseManagement.updateCourseAsAdmin.mockResolvedValue({ id: COURSE_ID });
    const changes = {
      code: 'ISIS1002', name: 'Programación', complexity: 'Foundational',
      careerId: CAREER_ID, aliases: ['IP', 'intro'], basePrice: '45000',
    };

    const res = await route.PATCH(req('PATCH', '/api/admin/courses', { courseId: COURSE_ID, ...changes }));

    expect(res.status).toBe(200);
    expect(courseManagement.updateCourseAsAdmin).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      courseId: COURSE_ID,
      changes: { ...changes, basePrice: 45000 },
    }));
  });

  it('keeps the legacy price-only body working', async () => {
    courseManagement.updateCourseAsAdmin.mockResolvedValue({ id: COURSE_ID });
    await route.PATCH(req('PATCH', '/api/admin/courses', { courseId: COURSE_ID, basePrice: 50000 }));
    expect(courseManagement.updateCourseAsAdmin).toHaveBeenCalledWith(expect.objectContaining({
      changes: { basePrice: 50000 },
    }));
  });

  it.each([
    ['no fields to change', {}],
    ['zero price', { basePrice: 0 }],
    ['unknown complexity', { complexity: 'Hard' }],
    ['non-uuid career', { careerId: 'isis' }],
    ['too many aliases', { aliases: Array.from({ length: 31 }, (_, i) => `a${i}`) }],
    ['alias too long', { aliases: ['x'.repeat(61)] }],
    ['short name', { name: 'ab' }],
  ])('rejects %s with 422', async (_label, extra) => {
    const res = await route.PATCH(req('PATCH', '/api/admin/courses', { courseId: COURSE_ID, ...extra }));
    expect(res.status).toBe(422);
    expect(courseManagement.updateCourseAsAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ['COURSE_NOT_FOUND', 404, 'COURSE_NOT_FOUND'],
    ['P2002', 409, 'COURSE_EXISTS'],
    ['P2003', 422, 'INVALID_CAREER'],
  ])('maps service error %s to %i', async (code, status, error) => {
    courseManagement.updateCourseAsAdmin.mockRejectedValue(Object.assign(new Error(code), { code }));
    const res = await route.PATCH(req('PATCH', '/api/admin/courses', { courseId: COURSE_ID, name: 'Programación' }));
    expect(res.status).toBe(status);
    expect((await res.json()).error).toBe(error);
  });
});

describe('/api/courses/[id]', () => {
  it('no longer exposes the unaudited PUT/DELETE handlers', () => {
    expect(courseByIdRoute.GET).toBeInstanceOf(Function);
    expect(courseByIdRoute.PUT).toBeUndefined();
    expect(courseByIdRoute.DELETE).toBeUndefined();
  });
});
