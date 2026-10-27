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

describe('fetchTransaction — keyed search by reference (Wompi 500 on GET /transactions/:id)', () => {
  // Shape copied from the real keyed search answer of 2026-10-17.
  const TX = {
    id: '1566631-1792284027-32042', status: 'APPROVED', amount_in_cents: 300000,
    reference: 'TXN-1792283951385-8qtvpdsza', payment_method_type: 'CARD',
  };
  const authHeaderOf = (call) => call[1]?.headers?.Authorization ?? null;
  const listResponse = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });
  const fiveHundreds = () => {
    for (let i = 0; i < 3; i += 1) global.fetch.mockResolvedValueOnce(failResponse(500));
  };

  beforeEach(() => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_prod_abc';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('answers from the keyed search when the keyed lookup by id keeps failing', async () => {
    fiveHundreds();
    global.fetch.mockResolvedValueOnce(listResponse([TX]));

    const tx = await load().fetchTransaction(TX.id, { ...NO_DELAY, reference: TX.reference, since: '2026-10-17T20:00:00Z' });

    expect(tx).toEqual(TX);
    expect(global.fetch).toHaveBeenCalledTimes(4); // never reaches the unauthenticated lookup
    const [searchUrl, init] = global.fetch.mock.calls[3];
    expect(authHeaderOf([searchUrl, init])).toBe('Bearer prv_prod_abc');
    const params = new URL(searchUrl).searchParams;
    expect(params.get('reference')).toBe(TX.reference);
    expect(params.get('from_date')).toBe('2026-10-16');
    expect(params.get('page')).toBe('1');
    expect(params.get('page_size')).toBe('10');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('keyed search by reference'));
  });

  it('ignores a search hit with another id and falls through to the unauthenticated lookup', async () => {
    fiveHundreds();
    global.fetch
      .mockResolvedValueOnce(listResponse([{ ...TX, id: 'someone-else' }]))
      .mockResolvedValueOnce(okResponse(TX));

    const tx = await load().fetchTransaction(TX.id, { ...NO_DELAY, reference: TX.reference });

    expect(tx).toEqual(TX);
    expect(authHeaderOf(global.fetch.mock.calls[4])).toBeNull();
  });

  it('ignores a search hit without the fields the checkout needs', async () => {
    fiveHundreds();
    const { amount_in_cents, ...noAmount } = TX;
    global.fetch
      .mockResolvedValueOnce(listResponse([noAmount]))
      .mockResolvedValueOnce(okResponse(TX));

    await load().fetchTransaction(TX.id, { ...NO_DELAY, reference: TX.reference });
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('a failing search falls through, and without a reference it is never tried', async () => {
    fiveHundreds();
    global.fetch.mockResolvedValueOnce(failResponse(422)).mockResolvedValueOnce(okResponse(TX));
    await load().fetchTransaction(TX.id, { ...NO_DELAY, reference: TX.reference });
    expect(global.fetch).toHaveBeenCalledTimes(5);

    global.fetch.mockReset();
    fiveHundreds();
    global.fetch.mockResolvedValueOnce(okResponse(TX));
    await load().fetchTransaction(TX.id, NO_DELAY);
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('a 404 by id is final — no search, no fallback', async () => {
    global.fetch.mockResolvedValueOnce(failResponse(404));
    await expect(load().fetchTransaction(TX.id, { ...NO_DELAY, reference: TX.reference }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('verifyEventChecksum', () => {
  const crypto = require('crypto');
  const SECRET = 'prod_events_secret';
  const sha = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

  // Shape of a real Wompi event (docs.wompi.co/docs/colombia/eventos): the
  // properties to sign come with the event and the digest is uppercase.
  function wompiEvent({ status = 'APPROVED', properties, checksum } = {}) {
    const transaction = {
      id: '1337194-1792682898-12345', status, amount_in_cents: 4500000,
      reference: 'TXN-1792682897687-dhi2pobcz', currency: 'COP', payment_method_type: 'PSE',
    };
    const signed = properties ?? ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
    const timestamp = 1792683000;
    return {
      event: 'transaction.updated',
      data: { transaction },
      environment: 'prod',
      signature: {
        properties: signed,
        checksum: checksum
          ?? sha(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${SECRET}`).toUpperCase(),
      },
      timestamp,
    };
  }

  it('accepts a genuine event signed over signature.properties (uppercase digest)', () => {
    expect(load().verifyEventChecksum(wompiEvent(), SECRET)).toBe(true);
  });

  it('accepts the same digest in lowercase', () => {
    const event = wompiEvent();
    event.signature.checksum = event.signature.checksum.toLowerCase();
    expect(load().verifyEventChecksum(event, SECRET)).toBe(true);
  });

  it('follows whatever properties the event lists, in their order', () => {
    const event = wompiEvent({ properties: ['transaction.reference', 'transaction.id'] });
    const { reference, id } = event.data.transaction;
    event.signature.checksum = sha(`${reference}${id}${event.timestamp}${SECRET}`);
    expect(load().verifyEventChecksum(event, SECRET)).toBe(true);
  });

  it('regression 2026-10-22: the old hardcoded formula (with currency) is not what Wompi signs', () => {
    const event = wompiEvent();
    const { id, status, amount_in_cents: cents, currency } = event.data.transaction;
    event.signature.checksum = sha(`${id}${status}${cents}${currency}${event.timestamp}${SECRET}`);
    expect(load().verifyEventChecksum(event, SECRET)).toBe(false);
  });

  it('rejects a tampered status, a wrong secret and a missing signature list', () => {
    const tampered = wompiEvent();
    tampered.data.transaction.status = 'DECLINED';
    expect(load().verifyEventChecksum(tampered, SECRET)).toBe(false);

    expect(load().verifyEventChecksum(wompiEvent(), 'another_secret')).toBe(false);
    expect(load().verifyEventChecksum(wompiEvent({ properties: [] }), SECRET)).toBe(false);

    const noList = wompiEvent();
    delete noList.signature.properties;
    expect(load().verifyEventChecksum(noList, SECRET)).toBe(false);
  });

  it('rejects an event that lists a property it does not carry', () => {
    const event = wompiEvent({ properties: ['transaction.id', 'transaction.missing'] });
    event.signature.checksum = sha(`${event.data.transaction.id}undefined${event.timestamp}${SECRET}`);
    expect(load().verifyEventChecksum(event, SECRET)).toBe(false);
  });
});
