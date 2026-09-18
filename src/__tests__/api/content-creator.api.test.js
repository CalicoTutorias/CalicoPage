/**
 * @jest-environment node
 *
 * /api/content-creator/* — every verb short-circuits on the token guard,
 * service errors map to 400/404/409 and create/delete/publish are audited.
 */

jest.mock('@/lib/auth/guards');
jest.mock('@/lib/services/marketing-piece.service');
jest.mock('@/lib/services/admin-audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(null),
  ADMIN_ACTIONS: {
    MARKETING_PIECE_CREATE: 'MARKETING_PIECE_CREATE',
    MARKETING_PIECE_DELETE: 'MARKETING_PIECE_DELETE',
    MARKETING_POST_PUBLISH: 'MARKETING_POST_PUBLISH',
  },
}));

const { NextResponse } = require('next/server');
const { requireContentCreator } = require('@/lib/auth/guards');
const service = require('@/lib/services/marketing-piece.service');
const { logAction } = require('@/lib/services/admin-audit.service');

const { GET: me } = require('@/app/api/content-creator/me/route');
const { GET: list } = require('@/app/api/content-creator/pieces/route');
const { GET: detail, PUT: save, DELETE: remove } = require('@/app/api/content-creator/pieces/[slug]/route');
const { POST: uploads } = require('@/app/api/content-creator/pieces/[slug]/uploads/route');
const { POST: publish } = require('@/app/api/content-creator/pieces/[slug]/publish/route');

const ACTOR = { sub: 'u-1', name: 'Felipe', email: 'felipe@calico.co', role: 'ADMIN' };
const req = (method = 'GET', body) => new Request('http://localhost/x', {
  method,
  ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const ctx = (params) => ({ params: Promise.resolve(params) });
const domainError = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);

beforeEach(() => {
  jest.clearAllMocks();
  requireContentCreator.mockResolvedValue(ACTOR);
});

it('test_should_short_circuit_every_route_on_the_guard', async () => {
  requireContentCreator.mockResolvedValue(NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 401 }));
  const calls = [
    me(req()), list(req()), detail(req(), ctx({ slug: 'a' })), save(req('PUT', {}), ctx({ slug: 'a' })),
    remove(req('DELETE'), ctx({ slug: 'a' })), uploads(req('POST', {}), ctx({ slug: 'a' })), publish(req('POST', {}), ctx({ slug: 'a' })),
  ];
  for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  for (const fn of Object.values(service)) if (jest.isMockFunction(fn)) expect(fn).not.toHaveBeenCalled();
});

it('test_should_return_identity_and_never_cache', async () => {
  const res = await me(req());
  expect(await res.json()).toEqual({ success: true, user: { name: 'Felipe', email: 'felipe@calico.co' } });
  expect(res.headers.get('cache-control')).toBe('private, no-store');
});

it('test_should_create_with_201_and_audit', async () => {
  service.savePiece.mockResolvedValue({ slug: 'a', version: 1, created: true });
  const res = await save(req('PUT', { title: 'T', type: 'reel' }), ctx({ slug: 'a' }));
  expect(res.status).toBe(201);
  expect(service.savePiece).toHaveBeenCalledWith('a', { title: 'T', type: 'reel' }, ACTOR);
  expect(logAction).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'u-1', action: 'MARKETING_PIECE_CREATE', targetId: 'a' }));
});

it('test_should_not_audit_plain_updates', async () => {
  service.savePiece.mockResolvedValue({ slug: 'a', version: 3, created: false });
  const res = await save(req('PUT', {}), ctx({ slug: 'a' }));
  expect(res.status).toBe(200);
  expect(logAction).not.toHaveBeenCalled();
});

it('test_should_map_conflict_to_409_with_current_version', async () => {
  service.savePiece.mockRejectedValue(domainError('CONFLICT', { currentVersion: 7 }));
  const res = await save(req('PUT', {}), ctx({ slug: 'a' }));
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({ code: 'CONFLICT', currentVersion: 7 });
});

it.each([['VALIDATION_ERROR', 400], ['NOT_FOUND', 404]])('test_should_map_%s', async (code, status) => {
  service.getPiece.mockRejectedValue(domainError(code));
  expect((await detail(req(), ctx({ slug: 'a' }))).status).toBe(status);
});

it('test_should_hide_unexpected_errors', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  service.listPieces.mockRejectedValue(new Error('db down: secret host'));
  const res = await list(req());
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ success: false, error: 'Error interno' });
  spy.mockRestore();
});

it('test_should_reject_malformed_json', async () => {
  const res = await uploads(req('POST', '{no json'), ctx({ slug: 'a' }));
  expect(res.status).toBe(400);
  expect(service.requestUploads).not.toHaveBeenCalled();
});

it('test_should_audit_delete_and_publish', async () => {
  service.deletePiece.mockResolvedValue({ slug: 'a', title: 'T' });
  service.publishPiece.mockResolvedValue({ slug: 'a', publishedAt: new Date(), files: 3 });
  await remove(req('DELETE'), ctx({ slug: 'a' }));
  await publish(req('POST', { manifest: { title: 'T', format: 'carrusel' } }), ctx({ slug: 'a' }));
  expect(logAction.mock.calls.map(([c]) => c.action)).toEqual(['MARKETING_PIECE_DELETE', 'MARKETING_POST_PUBLISH']);
});
