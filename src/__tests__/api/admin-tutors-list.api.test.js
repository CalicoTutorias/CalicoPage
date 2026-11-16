/**
 * @jest-environment node
 *
 * GET /api/admin/tutors — query params reach admin.service.listApprovedTutors.
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/admin.service');

const { GET } = require('@/app/api/admin/tutors/route');
const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const adminService = require('@/lib/services/admin.service');

const ADMIN = { sub: 'admin-1', email: 'admin@calico.com' };

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue(ADMIN);
  adminService.listApprovedTutors.mockResolvedValue({ items: [], total: 0 });
});

const get = (query) => GET(new Request(`http://localhost/api/admin/tutors${query}`));

it('test_should_pass_the_course_filter_to_the_service', async () => {
  const response = await get('?status=active&courseId=course-123&search=ana');

  expect(response.status).toBe(200);
  expect(adminService.listApprovedTutors).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'active', courseId: 'course-123', search: 'ana' }),
  );
});

it('test_should_not_filter_by_course_when_the_param_is_missing_or_blank', async () => {
  await get('?status=active');
  await get('?status=active&courseId=%20');

  for (const [args] of adminService.listApprovedTutors.mock.calls) {
    expect(args.courseId).toBeUndefined();
  }
});

it('test_should_reject_non_admins', async () => {
  requireAdminUser.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }));

  const response = await get('?courseId=course-123');

  expect(response.status).toBe(403);
  expect(adminService.listApprovedTutors).not.toHaveBeenCalled();
});
