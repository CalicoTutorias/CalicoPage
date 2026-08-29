import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis;

// Direct connection through our own pg Pool — used when Accelerate isn't
// configured (local dev without an Accelerate API key, or as a fallback).
function createDirectPrismaClient() {
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
    // Con RDS Proxy delante: el Proxy pool-ea hacia RDS, aquí podés usar más conexiones.
    // Sin Proxy: mantener en 1-2 para no agotar los ~79 slots de RDS.
    max: Number(process.env.PG_POOL_MAX ?? 2),
    min: 0,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Prisma 7 requires either `adapter` (direct connection) or `accelerateUrl`
// (Prisma's managed connection pooler) — they're mutually exclusive per client.
// `DATABASE_URL` stays the direct RDS connection string everywhere (the CLI in
// prisma.config.ts relies on that for migrate/db push); Accelerate gets its
// own URL so app runtime and tooling can point at different places.
function createPrismaClient() {
  if (process.env.PRISMA_ACCELERATE_URL) {
    const { withAccelerate } = require('@prisma/extension-accelerate');
    return new PrismaClient({ accelerateUrl: process.env.PRISMA_ACCELERATE_URL }).$extends(
      withAccelerate(),
    );
  }
  return createDirectPrismaClient();
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;

export default prisma;
