/**
 * @jest-environment node
 *
 * Tests for the admin posts API surface:
 *   GET        /api/admin/posts
 *   GET/DELETE /api/admin/posts/[slug]
 *   GET        /api/admin/posts/[slug]/files/[name]
 *
 * Security focus: every verb short-circuits on the guard's NextResponse, and
 * deletions are audit-logged with the admin from the JWT.
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/marketing-post.service');
jest.mock('@/lib/services/admin-audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(null),
  ADMIN_ACTIONS: { MARKETING_POST_DELETE: 'MARKETING_POST_DELETE' },
}));

const { NextResponse } = require('next/server');
const { requireAdminUser } = require('@/lib/auth/guards');
const service = require('@/lib/services/marketing-post.service');
const { logAction } = require('@/lib/services/admin-audit.service');

const { GET: list } = require('@/app/api/admin/posts/route');
const { GET: detail, DELETE: remove } = require('@/app/api/admin/posts/[slug]/route');
const { GET: file } = require('@/app/api/admin/posts/[slug]/files/[name]/route');

const ADMIN = { sub: 'admin-1', role: 'ADMIN' };
const req = (url, method = 'GET') => new Request(`http://localhost${url}`, { method });
const ctx = (params) => ({ params: Promise.resolve(params) });

function domainError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
  requireAdminUser.mockResolvedValue(ADMIN);
});

describe('guards', () => {
  it('test_should_short_circuit_every_verb_when_guard_rejects', async () => {
    const denied = NextResponse.json({ success: false }, { status: 403 });
    requireAdminUser.mockResolvedValue(denied);

    expect((await list(req('/api/admin/posts'))).status).toBe(403);
    expect((await detail(req('/api/admin/posts/a'), ctx({ slug: 'a' }))).status).toBe(403);
    expect((await remove(req('/api/admin/posts/a', 'DELETE'), ctx({ slug: 'a' }))).status).toBe(403);
    expect((await file(req('/api/admin/posts/a/files/01.png'), ctx({ slug: 'a', name: '01.png' }))).status).toBe(403);

    expect(service.listPosts).not.toHaveBeenCalled();
    expect(service.getPost).not.toHaveBeenCalled();
    expect(service.deletePost).not.toHaveBeenCalled();
    expect(service.getPostFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/posts', () => {
  it('test_should_return_posts', async () => {
    service.listPosts.mockResolvedValue([{ slug: 'a' }]);
    const json = await (await list(req('/api/admin/posts'))).json();
    expect(json).toEqual({ success: true, posts: [{ slug: 'a' }] });
  });

  it('test_should_return_500_when_s3_fails', async () => {
    service.listPosts.mockRejectedValue(new Error('AccessDenied'));
    const res = await list(req('/api/admin/posts'));
    expect(res.status).toBe(500);
  });
});

describe('GET /api/admin/posts/[slug]', () => {
  it('test_should_map_domain_errors_to_status', async () => {
    service.getPost.mockRejectedValueOnce(domainError('VALIDATION_ERROR'));
    expect((await detail(req('/x'), ctx({ slug: '..' }))).status).toBe(400);

    service.getPost.mockRejectedValueOnce(domainError('NOT_FOUND'));
    expect((await detail(req('/x'), ctx({ slug: 'nope' }))).status).toBe(404);
  });
});

describe('DELETE /api/admin/posts/[slug]', () => {
  it('test_should_delete_and_audit_with_admin_from_jwt', async () => {
    service.deletePost.mockResolvedValue({ slug: 'mi-post', title: 'Mi post', removed: 8 });

    const res = await remove(req('/api/admin/posts/mi-post', 'DELETE'), ctx({ slug: 'mi-post' }));

    expect(res.status).toBe(200);
    expect(service.deletePost).toHaveBeenCalledWith('mi-post');
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1',
      action: 'MARKETING_POST_DELETE',
      targetType: 'MarketingPost',
      targetId: 'mi-post',
      payload: { title: 'Mi post', removedObjects: 8 },
    }));
  });

  it('test_should_not_audit_when_post_not_found', async () => {
    service.deletePost.mockRejectedValue(domainError('NOT_FOUND'));
    const res = await remove(req('/x', 'DELETE'), ctx({ slug: 'nope' }));
    expect(res.status).toBe(404);
    expect(logAction).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/posts/[slug]/files/[name]', () => {
  it('test_should_stream_png_as_private_attachment', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    service.getPostFile.mockResolvedValue({
      contentType: 'image/png',
      contentLength: bytes.length,
      body: { transformToWebStream: () => new Response(bytes).body },
    });

    const res = await file(req('/x'), ctx({ slug: 'mi-post', name: '01.png' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="mi-post-01.png"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('test_should_stream_presentation_pdf_with_pdf_content_type', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    service.getPostFile.mockResolvedValue({
      contentType: 'application/pdf',
      body: { transformToWebStream: () => new Response(bytes).body },
    });

    const res = await file(req('/x'), ctx({ slug: 'mi-repaso', name: 'presentacion.pdf' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="mi-repaso-presentacion.pdf"');
  });

  it('test_should_return_404_for_unlisted_file', async () => {
    service.getPostFile.mockRejectedValue(domainError('NOT_FOUND'));
    const res = await file(req('/x'), ctx({ slug: 'mi-post', name: '99.png' }));
    expect(res.status).toBe(404);
  });
});
