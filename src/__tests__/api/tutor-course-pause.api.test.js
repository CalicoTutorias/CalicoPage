/**
 * @jest-environment node
 *
 * POST / DELETE /api/tutor/courses/[courseId]/pause: tutors only, the tutor comes
 * from the JWT, and the service's errors map to their status codes.
 */

jest.mock('@/lib/auth/guards', () => ({ requireTutor: jest.fn() }));
jest.mock('@/lib/services/academic.service', () => ({
  pauseTutorCourse: jest.fn(),
  resumeTutorCourse: jest.fn(),
}));

const { NextResponse } = require('next/server');
const { requireTutor } = require('@/lib/auth/guards');
const service = require('@/lib/services/academic.service');
const route = require('@/app/api/tutor/courses/[courseId]/pause/route');

const COURSE = 'course-1';
const params = { params: Promise.resolve({ courseId: COURSE }) };
const req = (method, body) => new Request(`http://localhost/api/tutor/courses/${COURSE}/pause`, {
  method,
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const serviceError = (code) => Object.assign(new Error(code), { code });

beforeEach(() => {
  jest.clearAllMocks();
  requireTutor.mockResolvedValue({ sub: 'tutor-1' });
});

describe.each([
  ['POST', 'pauseTutorCourse', 'Paused'],
  ['DELETE', 'resumeTutorCourse', 'Approved'],
])('%s', (method, serviceFn, status) => {
  const call = (body) => route[method](req(method, body), params);

  it('changes the course of the tutor in the JWT, whatever the body says', async () => {
    service[serviceFn].mockResolvedValue({ tutorId: 'tutor-1', courseId: COURSE, status });

    const res = await call({ tutorId: 'otro-tutor' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, tutorCourse: { tutorId: 'tutor-1', courseId: COURSE, status } });
    expect(service[serviceFn]).toHaveBeenCalledWith('tutor-1', COURSE);
  });

  it('refuses whoever is not an approved tutor', async () => {
    requireTutor.mockResolvedValue(NextResponse.json({ success: false, error: 'TUTOR_NOT_APPROVED' }, { status: 403 }));

    expect((await call()).status).toBe(403);
    expect(service[serviceFn]).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_FOUND', 404],
    ['INVALID_STATE', 409],
  ])('maps %s to %i', async (code, expected) => {
    service[serviceFn].mockRejectedValue(serviceError(code));

    const res = await call();

    expect(res.status).toBe(expected);
    expect(await res.json()).toMatchObject({ success: false, code });
  });

  it('hides the detail of anything unexpected', async () => {
    service[serviceFn].mockRejectedValue(new Error('connection string with secrets'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await call();

    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secrets');
    console.error.mockRestore();
  });
});
