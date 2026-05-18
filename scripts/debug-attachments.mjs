import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

const url = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  database: url.pathname.slice(1).split('?')[0],
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const totalAttachments = await prisma.sessionAttachment.count();
console.log('Total session_attachments rows in DB:', totalAttachments);

const recentAttachments = await prisma.sessionAttachment.findMany({
  orderBy: { uploadedAt: 'desc' },
  take: 15,
});
console.log('\n--- Most recent attachments ---');
console.log(JSON.stringify(recentAttachments, null, 2));

// Recent sessions for student "1" (the test student) with their attachments
const recentSessions = await prisma.session.findMany({
  where: { participants: { some: { studentId: '1' } } },
  orderBy: { startTimestamp: 'desc' },
  take: 8,
  select: {
    id: true,
    courseId: true,
    tutorId: true,
    status: true,
    startTimestamp: true,
    attachments: { select: { id: true, fileName: true, s3Key: true } },
    payments: { select: { id: true, status: true } },
  },
});
console.log('\n--- Recent sessions for student "1" ---');
for (const s of recentSessions) {
  console.log({
    id: s.id,
    status: s.status,
    start: s.startTimestamp,
    payments: s.payments,
    attachmentCount: s.attachments.length,
    attachments: s.attachments,
  });
}

await prisma.$disconnect();
await pool.end();
