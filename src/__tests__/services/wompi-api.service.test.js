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
