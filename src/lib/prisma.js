import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis;

function createPrismaClient() {
  // Parse URL manually to avoid pg-connection-string overriding ssl config
  const url = new URL(process.env.DATABASE_URL);
  const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const pool = new Pool({
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1).split('?')[0],
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
    // El RDS admite 79 conexiones y cada worker levanta su propio pool.
    max: Number(process.env.PG_POOL_MAX ?? 3),
    // Sin esto, pg jamás cierra una conexión idle y los slots se agotan.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

export default prisma;
