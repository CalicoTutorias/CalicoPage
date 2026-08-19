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
    // RDS admite ~79 conexiones totales; cada worker Next.js tiene su propio pool.
    // Con max=2 y ~20 workers en producción usamos ≤40 slots (margen para rds_reserved).
    max: Number(process.env.PG_POOL_MAX ?? 2),
    // Cierra conexiones idle rápido para no acumular slots entre deploys/reintentos.
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    // Libera el pool cuando no hay queries pendientes (importante en workers serverless-style).
    allowExitOnIdle: true,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

export default prisma;
