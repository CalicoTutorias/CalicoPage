/** @jest-environment node */
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  global.fetch = jest.fn();
});
afterAll(() => { process.env = ORIGINAL_ENV; });

function load() { return require('@/lib/services/wompi-api.service'); }

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
  it('fetches from the base URL chosen by the key', async () => {
    process.env.WOMPI_PRIVATE_KEY = 'prv_test_abc';
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: 'tx-1' } }) });
    const tx = await load().fetchTransaction('tx-1');
    expect(tx).toEqual({ id: 'tx-1' });
    expect(global.fetch.mock.calls[0][0]).toBe('https://sandbox.wompi.co/v1/transactions/tx-1');
  });
});

describe('verifyEventChecksum', () => {
  const crypto = require('crypto');
  const SECRET = 'test_events_secret';
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

  // Shape of the documented Wompi event (docs.wompi.co/docs/colombia/eventos/).
  // The docs' sample checksum is not the real SHA-256 of its sample string,
  // so every expected checksum here is computed from the concatenation.
  function event({ properties, checksum } = {}) {
    return {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: '1234-1610641025-49201',
          amount_in_cents: 4490000,
          reference: 'MZQ3X2DE2SMX',
          currency: 'COP',
          status: 'APPROVED',
        },
      },
      signature: {
        properties: properties ?? ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
        checksum: checksum ?? sha256(`1234-1610641025-49201APPROVED44900001530291411${SECRET}`),
      },
      timestamp: 1530291411,
    };
  }

  it('accepts the documented properties (id, status, amount_in_cents)', () => {
    expect(load().verifyEventChecksum(event(), SECRET)).toBe(true);
  });

  it('follows signature.properties, e.g. when currency is signed too', () => {
    const body = event({
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents', 'transaction.currency'],
      checksum: sha256(`1234-1610641025-49201APPROVED4490000COP1530291411${SECRET}`),
    });
    expect(load().verifyEventChecksum(body, SECRET)).toBe(true);
  });

  it('accepts an uppercase checksum (Wompi sends hex in uppercase)', () => {
    const body = event();
    body.signature.checksum = body.signature.checksum.toUpperCase();
    expect(load().verifyEventChecksum(body, SECRET)).toBe(true);
  });

  it('rejects a tampered signed value', () => {
    const body = event();
    body.data.transaction.amount_in_cents = 100;
    expect(load().verifyEventChecksum(body, SECRET)).toBe(false);
  });

  it('rejects missing or empty signature.properties', () => {
    const missing = event();
    delete missing.signature.properties;
    expect(load().verifyEventChecksum(missing, SECRET)).toBe(false);
    expect(load().verifyEventChecksum(event({ properties: [] }), SECRET)).toBe(false);
  });

  it('rejects a listed property that is absent from data', () => {
    // Checksum as if the absent value were an empty string: still refused.
    const body = event({
      properties: ['transaction.id', 'transaction.missing'],
      checksum: sha256(`1234-1610641025-492011530291411${SECRET}`),
    });
    expect(load().verifyEventChecksum(body, SECRET)).toBe(false);
  });

  it('rejects a missing checksum or timestamp', () => {
    const noChecksum = event();
    delete noChecksum.signature.checksum;
    const noTimestamp = event();
    delete noTimestamp.timestamp;
    expect(load().verifyEventChecksum(noChecksum, SECRET)).toBe(false);
    expect(load().verifyEventChecksum(noTimestamp, SECRET)).toBe(false);
  });

  it('rejects a checksum computed with another secret', () => {
    expect(load().verifyEventChecksum(event(), 'another_secret')).toBe(false);
  });
});
