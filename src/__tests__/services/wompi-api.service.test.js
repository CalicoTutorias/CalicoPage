/** @jest-environment node */
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  global.fetch = jest.fn();
});
afterAll(() => { process.env = ORIGINAL_ENV; });

function load() { return require('@/lib/services/wompi-api.service'); }

const okResponse = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
const failResponse = (status, body = '{"error":{"type":"INTERNAL"}}') => ({
  ok: false, status, text: async () => body,
});
const NO_DELAY = { retryDelayMs: 0 };
// The authenticated path alone (the unauthenticated last resort has its own tests).
const KEY_ONLY = { ...NO_DELAY, allowUnauthenticatedFallback: false };

describe('getBaseUrl', () => {
  it('uses sandbox for test keys even when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_abc';
    expect(load().getBaseUrl()).toBe('https://sandbox.wompi.co/v1');
  });

  it('uses production for production keys even outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_abc';
    expect(load().getBaseUrl()).toBe('https://production.wompi.co/v1');
  });
});

describe('fetchTransaction', () => {
  beforeEach(() => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_abc';
  });

  it('fetches from the base URL chosen by the key', async () => {
    global.fetch.mockResolvedValue(okResponse({ id: 'tx-1' }));
    const tx = await load().fetchTransaction('tx-1');
    expect(tx).toEqual({ id: 'tx-1' });
    expect(global.fetch.mock.calls[0][0]).toBe('https://sandbox.wompi.co/v1/transactions/tx-1');
  });

  it('retries a transient Wompi 500 and returns the transaction once it answers', async () => {
    global.fetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(okResponse({ id: 'tx-1', status: 'APPROVED' }));

    const tx = await load().fetchTransaction('tx-1', NO_DELAY);

    expect(tx).toMatchObject({ id: 'tx-1', status: 'APPROVED' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries network errors and timeouts too', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(abort)
      .mockResolvedValueOnce(okResponse({ id: 'tx-1' }));

    const tx = await load().fetchTransaction('tx-1', NO_DELAY);

    expect(tx).toEqual({ id: 'tx-1' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('gives up as PROVIDER_UNAVAILABLE (retryable) after the configured attempts', async () => {
    global.fetch.mockResolvedValue(failResponse(503));

    await expect(load().fetchTransaction('tx-1', { attempts: 3, ...KEY_ONLY })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      retryable: true,
      status: 503,
      message: expect.stringContaining('after 3 attempt(s)'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404: the transaction does not exist', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(load().fetchTransaction('tx-missing', NO_DELAY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry other 4xx (our request is wrong, not Wompi)', async () => {
    global.fetch.mockResolvedValue(failResponse(401, '{"error":"unauthorized"}'));

    await expect(load().fetchTransaction('tx-1', KEY_ONLY)).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining('HTTP 401'),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses to run without a private key', async () => {
    delete process.env.WOMPI_PRIVATE_KEY;
    await expect(load().fetchTransaction('tx-1')).rejects.toThrow(/WOMPI_PRIVATE_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('fetchTransaction — unauthenticated last resort', () => {
  const APPROVED = { id: 'tx-1', status: 'APPROVED', amount_in_cents: 300000 };
  const authHeaderOf = (call) => call[1]?.headers?.Authorization ?? null;

  beforeEach(() => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_abc';
  });

  it('falls back to the unauthenticated lookup when Wompi rejects the key (401/403) and warns', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce(failResponse(401, '{"error":{"type":"INVALID_ACCESS_TOKEN","reason":"La llave proporcionada no corresponde a este ambiente"}}'))
      .mockResolvedValueOnce(okResponse(APPROVED));

    const tx = await load().fetchTransaction('tx-1', NO_DELAY);

    expect(tx).toEqual(APPROVED);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(global.fetch.mock.calls[0])).toBe('Bearer prv_prod_abc');
    expect(authHeaderOf(global.fetch.mock.calls[1])).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WOMPI_PRIVATE_KEY'));
    warn.mockRestore();
  });

  it('falls back after the authenticated retries are exhausted on 5xx', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(okResponse(APPROVED));

    const tx = await load().fetchTransaction('tx-1', { attempts: 3, ...NO_DELAY });

    expect(tx).toEqual(APPROVED);
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(authHeaderOf(global.fetch.mock.calls[3])).toBeNull();
    console.warn.mockRestore();
  });

  it('keeps the original error when the fallback does not answer either', async () => {
    global.fetch
      .mockResolvedValueOnce(failResponse(403, '{"error":{"reason":"El token no tiene suficientes permisos"}}'))
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });

    await expect(load().fetchTransaction('tx-1', NO_DELAY)).rejects.toMatchObject({ status: 403 });
  });

  it('never falls back on a 404 (the transaction does not exist) nor when disabled', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    await expect(load().fetchTransaction('tx-1', NO_DELAY)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    global.fetch.mockReset();
    global.fetch.mockResolvedValue(failResponse(401));
    await expect(load().fetchTransaction('tx-1', { ...NO_DELAY, allowUnauthenticatedFallback: false })).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('verifyPrivateKey', () => {
  it('reports ok when Wompi answers 404 for an impossible id (the key is accepted)', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_abc';
    global.fetch.mockResolvedValue({ ok: false, status: 404, text: async () => '' });
    await expect(load().verifyPrivateKey()).resolves.toEqual({ ok: true, environment: 'production', status: 404, reason: null });
    expect(global.fetch.mock.calls[0][0]).toMatch(/^https:\/\/production\.wompi\.co\/v1\/transactions\//);
  });

  it('reports the rejection reason when the key belongs to another environment', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_abc';
    global.fetch.mockResolvedValue(failResponse(401, '{"error":{"type":"INVALID_ACCESS_TOKEN","reason":"La llave proporcionada no corresponde a este ambiente"}}'));
    await expect(load().verifyPrivateKey()).resolves.toEqual({
      ok: false, environment: 'sandbox', status: 401, reason: 'La llave proporcionada no corresponde a este ambiente',
    });
  });

  it('never throws: a missing key or a network error come back as a reason', async () => {
    delete process.env.WOMPI_PRIVATE_KEY;
    await expect(load().verifyPrivateKey()).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('WOMPI_PRIVATE_KEY') });
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_abc';
    global.fetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(load().verifyPrivateKey()).resolves.toMatchObject({ ok: false, status: null, reason: 'fetch failed' });
  });
});
