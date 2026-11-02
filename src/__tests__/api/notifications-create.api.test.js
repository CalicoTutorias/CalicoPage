/**
 * @jest-environment node
 *
 * POST /api/notifications is admin-only (prevents notification spoofing).
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { user: { findUnique: jest.fn() }, notification: { create: jest.fn() } },
}));

jest.mock('@/lib/auth/middleware', () => ({
  authenticateRequest: jest.fn(),
}));

const prisma = require('@/lib/prisma').default;
const { authenticateRequest } = require('@/lib/auth/middleware');
const route = require('@/app/api/notifications/route');

function buildRequest() {
  return new Request('http://localhost/api/notifications', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'victim', type: 'x', message: 'spoofed' }),
  });
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/notifications', () => {
  it('returns 403 for a non-admin user and creates nothing', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'STUDENT', isActive: true });

    const res = await route.POST(buildRequest());

    expect(res.status).toBe(403);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates the notification for an admin', async () => {
    authenticateRequest.mockResolvedValue({ sub: 'a1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'a1', role: 'ADMIN', isActive: true });
    prisma.notification.create.mockResolvedValue({ id: 'n1' });

    const res = await route.POST(buildRequest());

    expect(res.status).toBe(201);
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});
