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
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
