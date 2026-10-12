/**
 * authFetch — a 401 on a protected endpoint announces an expired session so
 * the auth context can send the user to login instead of each screen showing
 * "Missing or malformed Authorization header".
 */
import { authFetch, SESSION_EXPIRED_EVENT } from '@/app/services/authFetch';

const respond = (status, body = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

let fired;
beforeEach(() => {
  fired = [];
  window.addEventListener(SESSION_EXPIRED_EVENT, (e) => fired.push(e.detail.url));
  global.fetch = jest.fn();
});

it('fires SESSION_EXPIRED_EVENT on a 401 from a protected endpoint', async () => {
  global.fetch.mockResolvedValue(respond(401, { error: 'Missing or malformed Authorization header' }));
  const res = await authFetch('/api/attachments/presigned-urls', { method: 'POST', body: '{}' });
  expect(res.status).toBe(401);
  expect(fired).toEqual(['/api/attachments/presigned-urls']);
});

it.each(['/api/auth/me', '/api/auth/login', '/api/auth/google', '/api/auth/logout'])(
  'does not fire for %s, where 401 is a normal answer',
  async (url) => {
    global.fetch.mockResolvedValue(respond(401));
    await authFetch(url);
    expect(fired).toEqual([]);
  },
);

it('does not fire on other statuses', async () => {
  global.fetch.mockResolvedValueOnce(respond(200, { success: true }));
  global.fetch.mockResolvedValueOnce(respond(403));
  global.fetch.mockResolvedValueOnce(respond(500));
  await authFetch('/api/sessions');
  await authFetch('/api/sessions');
  await authFetch('/api/sessions');
  expect(fired).toEqual([]);
});
