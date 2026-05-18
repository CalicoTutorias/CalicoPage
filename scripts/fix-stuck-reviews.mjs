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

const stuck = await prisma.review.findMany({
  where: { status: 'pending', rating: { not: null } },
  select: { id: true, tutorId: true, rating: true, comment: true },
});
console.log(`Found ${stuck.length} stuck review(s):`);
console.log(stuck);

if (stuck.length > 0) {
  const res = await prisma.review.updateMany({
    where: { status: 'pending', rating: { not: null } },
    data: { status: 'done' },
  });
  console.log(`Promoted ${res.count} row(s) to status='done'.`);

  const tutorIds = [...new Set(stuck.map((r) => r.tutorId))];
  for (const tutorId of tutorIds) {
    const reviews = await prisma.review.findMany({
      where: { tutorId, status: 'done', rating: { not: null } },
      select: { rating: true },
    });
    let avg = 0;
    if (reviews.length > 0) {
      avg = reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length;
      avg = Math.round(avg * 100) / 100;
    }
    await prisma.tutorProfile.update({
      where: { userId: tutorId },
      data: { review: avg, numReview: reviews.length },
    });
    console.log(`Tutor ${tutorId}: avg=${avg}, count=${reviews.length}`);
  }
}

await prisma.$disconnect();
await pool.end();
