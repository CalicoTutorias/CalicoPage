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

const TUTOR_ID = '2';

const profile = await prisma.tutorProfile.findUnique({
  where: { userId: TUTOR_ID },
  include: { user: { select: { id: true, name: true } } },
});
console.log('--- TutorProfile ---');
console.log({
  userId: profile?.userId,
  userName: profile?.user?.name,
  review: profile?.review?.toString(),
  numReview: profile?.numReview,
});

const allReviews = await prisma.review.findMany({
  where: { tutorId: TUTOR_ID },
  select: {
    id: true,
    sessionId: true,
    studentId: true,
    tutorId: true,
    courseId: true,
    rating: true,
    status: true,
    comment: true,
  },
});
console.log('\n--- All reviews where tutorId = "2" ---');
console.log(JSON.stringify(allReviews, null, 2));

const doneReviews = await prisma.review.findMany({
  where: { tutorId: TUTOR_ID, status: 'done' },
  select: { id: true, rating: true, status: true, comment: true, courseId: true },
});
console.log('\n--- Reviews with status = "done" ---');
console.log(JSON.stringify(doneReviews, null, 2));

const tutorCourses = await prisma.tutorCourse.findMany({
  where: { tutorProfileId: TUTOR_ID, status: 'Approved' },
  include: { course: { select: { id: true, name: true } } },
});
console.log('\n--- Tutor approved courses ---');
console.log(tutorCourses.map((tc) => ({ courseId: tc.course.id, name: tc.course.name })));

const recentReviews = await prisma.review.findMany({
  orderBy: { id: 'desc' },
  take: 5,
  select: {
    id: true,
    tutorId: true,
    studentId: true,
    courseId: true,
    rating: true,
    status: true,
    comment: true,
  },
});
console.log('\n--- 5 most recent reviews in DB ---');
console.log(JSON.stringify(recentReviews, null, 2));

await prisma.$disconnect();
await pool.end();
