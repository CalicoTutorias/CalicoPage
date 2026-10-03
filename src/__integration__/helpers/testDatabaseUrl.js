// The one place the integration suite decides which database it may touch.
// CommonJS: required by globalSetup (plain Node, before Jest's transform of
// test files) and by setupEnv.
//
// The suite drops the whole `public` schema, so the URL is validated and then
// rebuilt from its parts: drivers never see the raw string. Refused:
//   - a query string or fragment (pg honours `?host=`, which would redirect
//     the connection after the hostname check);
//   - any protocol other than postgres;
//   - any host but `localhost` / `127.0.0.1`. IPv6 loopback is deliberately
//     not allowed: new URL() reports it as `[::1]`, which src/lib/prisma.js
//     does not recognise as local.

const DEFAULT_URL = 'postgresql://calico:calico@localhost:5433/calico_test';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];
const PROTOCOLS = ['postgresql:', 'postgres:'];

function refuse(reason) {
  return new Error(`Integration tests refuse this database URL: ${reason}.`);
}

/**
 * @param {string} [raw] defaults to INTEGRATION_DATABASE_URL, else the local docker database
 * @returns {{ host: string, port: number, user: string, password: string, database: string, url: string }}
 *   the parts for pg.Client and `url`, the canonical URL (no query) for DATABASE_URL / the Prisma CLI
 */
function resolveTestDatabase(raw = process.env.INTEGRATION_DATABASE_URL || DEFAULT_URL) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw refuse('not a valid URL');
  }
  if (!PROTOCOLS.includes(parsed.protocol)) throw refuse(`protocol ${parsed.protocol} is not postgres`);
  if (parsed.search !== '' || parsed.hash !== '') throw refuse('query strings and fragments are not allowed');
  if (!LOCAL_HOSTS.includes(parsed.hostname)) throw refuse(`${parsed.hostname} is not a local host`);

  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!database || database.includes('/')) throw refuse('missing or invalid database name');

  const parts = {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
  const auth = `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}`;
  const url = `postgresql://${auth}@${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`;
  return { ...parts, url };
}

module.exports = { resolveTestDatabase };
