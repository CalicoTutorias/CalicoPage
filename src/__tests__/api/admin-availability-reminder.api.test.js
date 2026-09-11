/**
 * @jest-environment node
 *
 * Tests for the admin "pon tu horario" reminder endpoints:
 *   POST /api/admin/tutors/availability-reminder          (bulk)
 *   POST /api/admin/tutors/[userId]/availability-reminder (single)
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/admin.service');

const { POST: bulkPOST } = require('@/app/api/admin/tutors/availability-reminder/route');
const { POST: singlePOST } = require('@/app/api/admin/tutors/[userId]/availability-reminder/route');
const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const adminService = require('@/lib/services/admin.service');

const ADMIN = { sub: 'admin-1', email: 'admin@calico.com' };

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue(ADMIN);
});

describe('POST /api/admin/tutors/availability-reminder (bulk)', () => {
  it('sends to every hidden tutor when no body is given and respects the cooldown', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({
      sent: [{ userId: 't1', email: 't1@uniandes.edu.co' }],
      failed: [],
      skipped: [{ userId: 't2', reason: 'RECENTLY_REMINDED' }],
    });

    const request = new Request('http://localhost/api/admin/tutors/availability-reminder', {
      method: 'POST',
    });
    const response = await bulkPOST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.sent).toHaveLength(1);
    expect(json.skipped).toHaveLength(1);
    expect(adminService.sendAvailabilityReminders).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: undefined,
        adminId: 'admin-1',
        skipRecentlyReminded: true,
      }),
    );
  });

  it('forwards an explicit userIds list', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({ sent: [], failed: [], skipped: [] });

    const request = new Request('http://localhost/api/admin/tutors/availability-reminder', {
      method: 'POST',
      body: JSON.stringify({ userIds: ['t1', 't2'] }),
      headers: { 'Content-Type': 'application/json' },
    });
    await bulkPOST(request);

    expect(adminService.sendAvailabilityReminders).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['t1', 't2'] }),
    );
  });

  it('returns 422 on a malformed body', async () => {
    const request = new Request('http://localhost/api/admin/tutors/availability-reminder', {
      method: 'POST',
      body: JSON.stringify({ userIds: 'not-an-array' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await bulkPOST(request);
    expect(response.status).toBe(422);
    expect(adminService.sendAvailabilityReminders).not.toHaveBeenCalled();
  });

  it('returns 503 when the Brevo template is not configured yet', async () => {
    const err = new Error('template missing');
    err.code = 'EMAIL_TEMPLATE_NOT_CONFIGURED';
    adminService.sendAvailabilityReminders.mockRejectedValue(err);

    const request = new Request('http://localhost/api/admin/tutors/availability-reminder', {
      method: 'POST',
    });
    const response = await bulkPOST(request);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('rejects non-admin requests', async () => {
    requireAdminUser.mockResolvedValue(
      NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    );
    const request = new Request('http://localhost/api/admin/tutors/availability-reminder', {
      method: 'POST',
    });
    const response = await bulkPOST(request);
    expect(response.status).toBe(403);
    expect(adminService.sendAvailabilityReminders).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/tutors/[userId]/availability-reminder (single)', () => {
  it('sends to one tutor without the cooldown', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({
      sent: [{ userId: 't1', email: 't1@uniandes.edu.co' }],
      failed: [],
      skipped: [],
    });

    const request = new Request('http://localhost/api/admin/tutors/t1/availability-reminder', {
      method: 'POST',
    });
    const response = await singlePOST(request, { params: Promise.resolve({ userId: 't1' }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(adminService.sendAvailabilityReminders).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['t1'],
        adminId: 'admin-1',
        skipRecentlyReminded: false,
      }),
    );
  });

  it('returns 400 with the reason when the tutor is already listed', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({
      sent: [],
      failed: [],
      skipped: [{ userId: 't1', reason: 'ALREADY_LISTED' }],
    });

    const request = new Request('http://localhost/api/admin/tutors/t1/availability-reminder', {
      method: 'POST',
    });
    const response = await singlePOST(request, { params: Promise.resolve({ userId: 't1' }) });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('ALREADY_LISTED');
  });

  it('returns 404 when the user does not exist', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({
      sent: [],
      failed: [],
      skipped: [{ userId: 'nope', reason: 'NOT_FOUND' }],
    });

    const request = new Request('http://localhost/api/admin/tutors/nope/availability-reminder', {
      method: 'POST',
    });
    const response = await singlePOST(request, { params: Promise.resolve({ userId: 'nope' }) });
    expect(response.status).toBe(404);
  });

  it('returns 502 when Brevo rejected the send', async () => {
    adminService.sendAvailabilityReminders.mockResolvedValue({
      sent: [],
      failed: [{ userId: 't1', reason: 'SEND_FAILED' }],
      skipped: [],
    });

    const request = new Request('http://localhost/api/admin/tutors/t1/availability-reminder', {
      method: 'POST',
    });
    const response = await singlePOST(request, { params: Promise.resolve({ userId: 't1' }) });
    expect(response.status).toBe(502);
  });
});
