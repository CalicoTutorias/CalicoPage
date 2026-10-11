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

    await expect(load().fetchTransaction('tx-1', { attempts: 3, ...NO_DELAY })).rejects.toMatchObject({
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

    await expect(load().fetchTransaction('tx-1', NO_DELAY)).rejects.toMatchObject({
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
