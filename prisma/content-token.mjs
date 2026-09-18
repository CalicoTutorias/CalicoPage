/**
 * Personal tokens for the content-creator tool (/api/content-creator/*).
 *
 *   node --env-file=.env prisma/content-token.mjs crear <email-admin> "<etiqueta>"
 *   node --env-file=.env prisma/content-token.mjs listar
 *   node --env-file=.env prisma/content-token.mjs revocar <id>
 *
 * `crear` prints the token ONCE: only its SHA-256 is stored. Put it in the
 * content-creator .env as CALICO_TOKEN. The user must be an active ADMIN.
 * Uses the same pg pool config as apply-pending.mjs (RDS certificate chain).
 */

import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

const [command, ...args] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Run with --env-file=.env');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
const pool = new Pool({
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1).split('?')[0],
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function crear(email, label) {
  if (!email || !label) throw new Error('Uso: crear <email-admin> "<etiqueta>" (ej. "PC de Felipe")');
  const { rows: [user] } = await pool.query(
    'SELECT id, name, role, is_active FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  if (!user) throw new Error(`No existe un usuario con email ${email}`);
  if (user.role !== 'ADMIN' || !user.is_active) throw new Error(`${email} no es un ADMIN activo`);

  const token = `cct_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(token).digest('hex');
  const { rows: [row] } = await pool.query(
    `INSERT INTO content_creator_tokens (id, user_id, label, token_hash)
     VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id`,
    [user.id, label, hash],
  );
  console.log(`Token creado para ${user.name} (${email}) · id ${row.id}`);
  console.log('\nCópialo ahora: no se vuelve a mostrar.\n');
  console.log(`CALICO_TOKEN=${token}\n`);
}

async function listar() {
  const { rows } = await pool.query(
    `SELECT t.id, t.label, u.email, t.created_at, t.last_used_at, t.revoked_at
     FROM content_creator_tokens t JOIN users u ON u.id = t.user_id
     ORDER BY t.created_at DESC`,
  );
  if (!rows.length) console.log('No hay tokens.');
  for (const r of rows) {
    const estado = r.revoked_at ? `revocado ${r.revoked_at.toISOString()}` : 'activo';
    const uso = r.last_used_at ? r.last_used_at.toISOString() : 'nunca';
    console.log(`${r.id}  ${r.email}  "${r.label}"  ${estado}  · último uso: ${uso}`);
  }
}

async function revocar(id) {
  if (!id) throw new Error('Uso: revocar <id> (ver `listar`)');
  const { rowCount } = await pool.query(
    'UPDATE content_creator_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL',
    [id],
  );
  console.log(rowCount ? `Token ${id} revocado.` : `No hay un token activo con id ${id}.`);
}

try {
  if (command === 'crear') await crear(args[0], args[1]);
  else if (command === 'listar') await listar();
  else if (command === 'revocar') await revocar(args[0]);
  else {
    console.error('Comandos: crear <email-admin> "<etiqueta>" · listar · revocar <id>');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
