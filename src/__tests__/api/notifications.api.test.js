/**
 * @jest-environment node
 *
 * Integration-style tests for notification API routes.
 *
 * Mocks Prisma at the lowest level and exercises the full
 * route handler → service → repository chain.
 */

// Mock Prisma singleton — prevents pg from loading
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    notification: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock auth middleware
jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');
const { NextResponse } = require('next/server');

// Import route handlers
const getUserRoute = require('@/app/api/notifications/user/[userId]/route');
const markReadRoute = require('@/app/api/notifications/[id]/read/route');
const readAllRoute = require('@/app/api/notifications/read-all/route');
const deleteRoute = require('@/app/api/notifications/[id]/route');

beforeEach(() => {
  jest.clearAllMocks();
});

/** Helper to build a minimal Request */
function buildRequest(url = 'http://localhost/api/notifications', options = {}) {
  return new Request(url, {
    headers: { authorization: 'Bearer test-token' },
    ...options,
  });
}

// ─── GET /api/notifications/user/:userId ──────────────────────────────

describe('GET /api/notifications/user/:userId', () => {
  it('returns 403 when userId does not match the auth token', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });

    const request = buildRequest('http://localhost/api/notifications/user/999');
    const response = await getUserRoute.GET(request, {
      params: Promise.resolve({ userId: '999' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns notifications for the authenticated user', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });

    const mockNotifications = [
      { id: 'n1', userId: 1, type: 'session_accepted', message: 'Accepted', isRead: false },
    ];
    prisma.notification.findMany.mockResolvedValue(mockNotifications);

    const request = buildRequest('http://localhost/api/notifications/user/1?limit=10');
    const response = await getUserRoute.GET(request, {
      params: Promise.resolve({ userId: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].type).toBe('session_accepted');
  });

  it('returns 401 when not authenticated', async () => {
    authenticateRequest.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const request = buildRequest('http://localhost/api/notifications/user/1');
    const response = await getUserRoute.GET(request, {
      params: Promise.resolve({ userId: '1' }),
    });

    expect(response.status).toBe(401);
  });
});

// ─── PUT /api/notifications/:id/read ──────────────────────────────────

describe('PUT /api/notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 1, isRead: false });
    prisma.notification.update.mockResolvedValue({ id: 'n1', userId: 1, isRead: true });

    const request = buildRequest('http://localhost/api/notifications/n1/read', { method: 'PUT' });
    const response = await markReadRoute.PUT(request, {
      params: Promise.resolve({ id: 'n1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.notification.isRead).toBe(true);
  });

  it('returns 404 when notification belongs to another user', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 99, isRead: false });

    const request = buildRequest('http://localhost/api/notifications/n1/read', { method: 'PUT' });
    const response = await markReadRoute.PUT(request, {
      params: Promise.resolve({ id: 'n1' }),
    });

    expect(response.status).toBe(404);
  });
});

// ─── PUT /api/notifications/read-all ──────────────────────────────────

describe('PUT /api/notifications/read-all', () => {
  it('marks all notifications as read for authenticated user', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const request = buildRequest('http://localhost/api/notifications/read-all', { method: 'PUT' });
    const response = await readAllRoute.PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.count).toBe(5);
  });
});

// ─── DELETE /api/notifications/:id ────────────────────────────────────

describe('DELETE /api/notifications/:id', () => {
  it('deletes a notification owned by the user', async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 1 });
    prisma.notification.delete.mockResolvedValue({ id: 'n1' });

    const request = buildRequest('http://localhost/api/notifications/n1', { method: 'DELETE' });
    const response = await deleteRoute.DELETE(request, {
      params: Promise.resolve({ id: 'n1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 404 when deleting someone else's notification", async () => {
    authenticateRequest.mockReturnValue({ sub: 1 });
    prisma.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 99 });

    const request = buildRequest('http://localhost/api/notifications/n1', { method: 'DELETE' });
    const response = await deleteRoute.DELETE(request, {
      params: Promise.resolve({ id: 'n1' }),
    });

    expect(response.status).toBe(404);
  });
});

// ─── Integration: session accept → notification creation ──────────────

describe('Session accept → notification flow', () => {
  it('creates session_accepted notifications via the service layer', async () => {
    prisma.notification.create.mockResolvedValue({
      id: 'n-new',
      userId: 1,
      type: 'session_accepted',
      message: 'Carlos aceptó tu tutoría de Cálculo.',
      isRead: false,
    });

    const notificationService = require('@/lib/services/notification.service');

    const session = {
      id: 'sess1',
      tutorId: 10,
      course: { name: 'Cálculo' },
      participants: [{ studentId: 1 }],
    };

    await notificationService.notifySessionAccepted(session, 'Carlos');

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        type: 'session_accepted',
        sessionId: 'sess1',
        metadata: expect.objectContaining({ tutorName: 'Carlos', courseName: 'Cálculo' }),
      }),
    });
  });
});
