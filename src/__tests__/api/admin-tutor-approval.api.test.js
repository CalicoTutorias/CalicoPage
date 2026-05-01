/**
 * @jest-environment node
 *
 * Tests for PUT /api/admin/tutors/:userId endpoint
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/user.service');

const { PUT } = require('@/app/api/admin/tutors/[userId]/route');
const { NextResponse } = require('next/server');
const { requireAdmin } = require('@/lib/auth/guards');
const userService = require('@/lib/services/user.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PUT /api/admin/tutors/[userId]', () => {
  it('approves a tutor application', async () => {
    const userId = 'user-123';
    const approvedUser = {
      id: userId,
      name: 'Juan García',
      isTutorRequested: true,
      isTutorApproved: true,
    };

    requireAdmin.mockReturnValue(undefined);
    userService.approveTutor.mockResolvedValue(approvedUser);

    const request = new Request('http://localhost/api/admin/tutors/user-123', {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId }),
    });

    expect(userService.approveTutor).toHaveBeenCalledWith(userId);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.user.isTutorApproved).toBe(true);
  });

  it('rejects a tutor application', async () => {
    const userId = 'user-456';
    const rejectedUser = {
      id: userId,
      name: 'María López',
      isTutorRequested: false,
      isTutorApproved: false,
    };

    requireAdmin.mockReturnValue(undefined);
    userService.rejectTutor.mockResolvedValue(rejectedUser);

    const request = new Request('http://localhost/api/admin/tutors/user-456', {
      method: 'PUT',
      body: JSON.stringify({ action: 'reject' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId }),
    });

    expect(userService.rejectTutor).toHaveBeenCalledWith(userId);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.user.isTutorApproved).toBe(false);
  });

  it('rejects unauthenticated requests', async () => {
    const guardResponse = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
    requireAdmin.mockReturnValue(guardResponse);

    const request = new Request('http://localhost/api/admin/tutors/user-123', {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId: 'user-123' }),
    });

    expect(response).toBe(guardResponse);
    expect(userService.approveTutor).not.toHaveBeenCalled();
  });

  it('validates action field', async () => {
    requireAdmin.mockReturnValue(undefined);

    const request = new Request('http://localhost/api/admin/tutors/user-123', {
      method: 'PUT',
      body: JSON.stringify({ action: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId: 'user-123' }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(userService.approveTutor).not.toHaveBeenCalled();
  });

  it('handles invalid JSON body', async () => {
    requireAdmin.mockReturnValue(undefined);

    const request = new Request('http://localhost/api/admin/tutors/user-123', {
      method: 'PUT',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId: 'user-123' }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Invalid JSON');
  });

  it('returns 404 when user not found', async () => {
    const error = new Error('User not found');
    error.code = 'P2025';

    requireAdmin.mockReturnValue(undefined);
    userService.approveTutor.mockRejectedValue(error);

    const request = new Request('http://localhost/api/admin/tutors/user-999', {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId: 'user-999' }),
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('User not found');
  });

  it('returns 400 when user is in invalid state', async () => {
    const error = new Error('User must be in tutor-pending state to approve');
    error.code = 'INVALID_STATE';

    requireAdmin.mockReturnValue(undefined);
    userService.approveTutor.mockRejectedValue(error);

    const request = new Request('http://localhost/api/admin/tutors/user-123', {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ userId: 'user-123' }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('not in a valid state');
  });
});
