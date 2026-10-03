/** @jest-environment node */
// The integration suite drops the `public` schema of whatever this helper
// accepts: only a plain local postgres URL may pass.
import { resolveTestDatabase } from '@/__integration__/helpers/testDatabaseUrl';

describe('resolveTestDatabase', () => {
  const saved = process.env.INTEGRATION_DATABASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.INTEGRATION_DATABASE_URL;
    else process.env.INTEGRATION_DATABASE_URL = saved;
  });

  it('accepts the default local docker database', () => {
    delete process.env.INTEGRATION_DATABASE_URL;
    expect(resolveTestDatabase()).toEqual({
      host: 'localhost',
      port: 5433,
      user: 'calico',
      password: 'calico',
      database: 'calico_test',
      url: 'postgresql://calico:calico@localhost:5433/calico_test',
    });
  });

  it('reads INTEGRATION_DATABASE_URL and accepts 127.0.0.1 (CI service on the default port)', () => {
    process.env.INTEGRATION_DATABASE_URL = 'postgres://calico:calico@127.0.0.1/calico_test';
    expect(resolveTestDatabase()).toMatchObject({
      host: '127.0.0.1',
      port: 5432,
      url: 'postgresql://calico:calico@127.0.0.1:5432/calico_test',
    });
  });

  it.each([
    ['a ?host= redirect', 'postgresql://calico:calico@localhost:5433/calico_test?host=evil.example.com'],
    ['any query string', 'postgresql://calico:calico@localhost:5433/calico_test?sslmode=disable'],
    ['a fragment', 'postgresql://calico:calico@localhost:5433/calico_test#frag'],
    ['an @ smuggled into the user info', 'postgresql://user@localhost@evil.example.com:5432/calico_test'],
    ['a look-alike host', 'postgresql://calico:calico@localhost.evil.com:5432/calico_test'],
    ['a non-local IP', 'postgresql://calico:calico@10.0.0.5:5432/calico_test'],
    ['IPv6 loopback (not recognised as local by src/lib/prisma.js)', 'postgresql://calico:calico@[::1]:5432/calico_test'],
    ['a non-postgres protocol', 'mysql://calico:calico@localhost:3306/calico_test'],
    ['a missing database name', 'postgresql://calico:calico@localhost:5433/'],
    ['something that is not a URL', 'not a url'],
  ])('refuses %s', (_label, raw) => {
    expect(() => resolveTestDatabase(raw)).toThrow(/refuse/);
  });
});
