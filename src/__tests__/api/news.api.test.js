/**
 * @jest-environment node
 *
 * Tests for the news API surface:
 *   GET  /api/news                      (public feed)
 *   GET/POST /api/admin/news            (admin list + create)
 *   PUT/DELETE /api/admin/news/[id]     (admin update + delete)
 *
 * Security focus: every admin verb must short-circuit on the guard's
 * NextResponse (rejection path), and the public feed only ever goes through
 * listPublished (drafts can't leak).
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/news.service');
jest.mock('@/lib/services/admin-audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(null),
  ADMIN_ACTIONS: {
    NEWS_CREATE: 'NEWS_CREATE',
    NEWS_UPDATE: 'NEWS_UPDATE',
    NEWS_DELETE: 'NEWS_DELETE',
  },
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const newsService = require('@/lib/services/news.service');
const { logAction } = require('@/lib/services/admin-audit.service');

const { GET: publicGet } = require('@/app/api/news/route');
const { GET: adminList, POST: adminCreate } = require('@/app/api/admin/news/route');
const { PUT: adminUpdate, DELETE: adminDelete } = require('@/app/api/admin/news/[id]/route');

const POST_ID = '3c9f6f2a-8f39-4c5f-9a6d-6a0b5b9f1c2e';

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/news (public)', () => {
  it('test_should_return_published_posts_without_auth', async () => {
    const posts = [{ id: POST_ID, title: 'Hola', content: '# md', imageUrl: null }];
    newsService.listPublished.mockResolvedValue(posts);

    const response = await publicGet(new Request('http://localhost/api/news?limit=3'));
    const json = await response.json();

    expect(newsService.listPublished).toHaveBeenCalledWith({ limit: 3, offset: 0 });
    expect(json.success).toBe(true);
    expect(json.posts).toEqual(posts);
  });

  it('test_should_reject_invalid_limit', async () => {
    const response = await publicGet(new Request('http://localhost/api/news?limit=999'));
    expect(response.status).toBe(400);
    expect(newsService.listPublished).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/news', () => {
  it('test_should_short_circuit_when_guard_rejects', async () => {
    const guardResponse = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
    requireAdminUser.mockResolvedValue(guardResponse);

    const response = await adminCreate(
      jsonRequest('http://localhost/api/admin/news', 'POST', { title: 'x', content: 'y' }),
    );

    expect(response).toBe(guardResponse);
    expect(newsService.createPost).not.toHaveBeenCalled();
    expect(logAction).not.toHaveBeenCalled();
  });

  it('test_should_create_post_with_author_from_jwt_and_audit_it', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
    newsService.createPost.mockResolvedValue({
      id: POST_ID, title: 'Hola', isPublished: false,
    });

    const response = await adminCreate(
      jsonRequest('http://localhost/api/admin/news', 'POST', {
        title: 'Hola',
        content: '# contenido',
        // authorId in the body must be ignored — identity comes from the JWT
        authorId: 'attacker-id',
      }),
    );

    expect(response.status).toBe(201);
    expect(newsService.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ authorId: 'admin-1', title: 'Hola' }),
    );
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ adminId: 'admin-1', action: 'NEWS_CREATE', targetId: POST_ID }),
    );
  });

  it('test_should_reject_invalid_body', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });

    const response = await adminCreate(
      jsonRequest('http://localhost/api/admin/news', 'POST', { title: '', content: '' }),
    );

    expect(response.status).toBe(400);
    expect(newsService.createPost).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/news', () => {
  it('test_should_short_circuit_when_guard_rejects', async () => {
    const guardResponse = NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 },
    );
    requireAdminUser.mockResolvedValue(guardResponse);

    const response = await adminList(new Request('http://localhost/api/admin/news'));

    expect(response).toBe(guardResponse);
    expect(newsService.listAll).not.toHaveBeenCalled();
  });

  it('test_should_return_editorial_list_for_admin', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
    newsService.listAll.mockResolvedValue({ items: [{ id: POST_ID }], total: 1 });

    const response = await adminList(new Request('http://localhost/api/admin/news'));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.total).toBe(1);
  });
});

describe('PUT /api/admin/news/[id]', () => {
  it('test_should_short_circuit_when_guard_rejects', async () => {
    const guardResponse = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
    requireAdminUser.mockResolvedValue(guardResponse);

    const response = await adminUpdate(
      jsonRequest(`http://localhost/api/admin/news/${POST_ID}`, 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: POST_ID }) },
    );

    expect(response).toBe(guardResponse);
    expect(newsService.updatePost).not.toHaveBeenCalled();
  });

  it('test_should_reject_non_uuid_id', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });

    const response = await adminUpdate(
      jsonRequest('http://localhost/api/admin/news/abc', 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );

    expect(response.status).toBe(400);
    expect(newsService.updatePost).not.toHaveBeenCalled();
  });

  it('test_should_update_and_audit', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
    newsService.updatePost.mockResolvedValue({ id: POST_ID, isPublished: true });

    const response = await adminUpdate(
      jsonRequest(`http://localhost/api/admin/news/${POST_ID}`, 'PUT', { isPublished: true }),
      { params: Promise.resolve({ id: POST_ID }) },
    );
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(newsService.updatePost).toHaveBeenCalledWith(POST_ID, { isPublished: true });
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NEWS_UPDATE', targetId: POST_ID }),
    );
  });

  it('test_should_return_404_when_post_missing', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
    const notFound = new Error('Publicación no encontrada');
    notFound.code = 'NOT_FOUND';
    newsService.updatePost.mockRejectedValue(notFound);

    const response = await adminUpdate(
      jsonRequest(`http://localhost/api/admin/news/${POST_ID}`, 'PUT', { title: 'x' }),
      { params: Promise.resolve({ id: POST_ID }) },
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/admin/news/[id]', () => {
  it('test_should_short_circuit_when_guard_rejects', async () => {
    const guardResponse = NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    );
    requireAdminUser.mockResolvedValue(guardResponse);

    const response = await adminDelete(
      new Request(`http://localhost/api/admin/news/${POST_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: POST_ID }) },
    );

    expect(response).toBe(guardResponse);
    expect(newsService.deletePost).not.toHaveBeenCalled();
  });

  it('test_should_delete_and_audit', async () => {
    requireAdminUser.mockResolvedValue({ sub: 'admin-1' });
    newsService.deletePost.mockResolvedValue({ id: POST_ID, title: 'Hola' });

    const response = await adminDelete(
      new Request(`http://localhost/api/admin/news/${POST_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: POST_ID }) },
    );
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(newsService.deletePost).toHaveBeenCalledWith(POST_ID);
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NEWS_DELETE', targetId: POST_ID }),
    );
  });
});
