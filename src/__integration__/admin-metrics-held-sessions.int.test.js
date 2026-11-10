/**
 * Which sessions the dashboard counts as held, against a real Postgres: the rule
 * is raw SQL, which tests with mocked repositories cannot check. Until 2026-11
 * only `Completed` sessions counted, and no screen ever marks one: the cards and
 * rankings stayed empty however many sessions ended.
 */
import prisma from '@/lib/prisma';
import {
  sessionHistory, sessionsByWeek, sessionsThisWeek, topCourses, topTutors,
} from '@/lib/repositories/admin-metrics.repository';
import { createCourse, createUser } from './helpers/factory';

const MINUTE = 60_000;

function createSession({ tutor, course, status, start, end }) {
  const now = Date.now();
  return prisma.session.create({
    data: {
      courseId: course.id,
      tutorId: tutor.id,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: new Date(now + start * MINUTE),
      endTimestamp: new Date(now + end * MINUTE),
      status,
      locationType: 'Virtual',
      source: 'Platform',
    },
  });
}

async function createOneOfEach() {
  const tutor = await createUser({ isTutorApproved: true });
  const course = await createCourse();
  // Starts minutes apart, all of them just now, so they share the current week.
  const sessions = {
    completed: await createSession({ tutor, course, status: 'Completed', start: -2, end: -1 }),
    acceptedEnded: await createSession({ tutor, course, status: 'Accepted', start: -3, end: -1 }),
    acceptedInProgress: await createSession({ tutor, course, status: 'Accepted', start: -4, end: 30 }),
    acceptedToCome: await createSession({ tutor, course, status: 'Accepted', start: 60, end: 120 }),
    pendingEnded: await createSession({ tutor, course, status: 'Pending', start: -5, end: -1 }),
    canceledEnded: await createSession({ tutor, course, status: 'Canceled', start: -6, end: -1 }),
    rejectedEnded: await createSession({ tutor, course, status: 'Rejected', start: -7, end: -1 }),
  };
  return { tutor, course, sessions };
}

/** The bucket of this week: other suites in this database leave sessions dated years ahead. */
function currentWeek(series) {
  const now = new Date();
  return series.filter((row) => new Date(row.weekStart) <= now).at(-1) ?? { completed: 0, canceled: 0, upcoming: 0 };
}

describe('sessions the dashboard counts as held', () => {
  it('counts the completed ones and the accepted ones that already ended, nothing else', async () => {
    const before = await sessionsThisWeek();

    const { tutor, course } = await createOneOfEach();

    expect(await sessionsThisWeek()).toBe(before + 2);
    expect((await topCourses({ days: 30, limit: 1000 })).find((c) => c.id === course.id).sessions).toBe(2);
    expect((await topTutors({ days: 30, limit: 1000 })).find((t) => t.id === tutor.id).sessions).toBe(2);
  });

  it('moves an accepted session from upcoming to completed in the weekly series once it ends', async () => {
    const before = currentWeek(await sessionsByWeek({ weeks: 2 }));

    await createOneOfEach();

    const after = currentWeek(await sessionsByWeek({ weeks: 2 }));
    expect(after.completed - before.completed).toBe(2);
    expect(after.canceled - before.canceled).toBe(1);
    // Accepted in progress, accepted to come and pending past its date.
    expect(after.upcoming - before.upcoming).toBe(3);
  });

  it('leaves out a tutor whose sessions have not ended', async () => {
    const tutor = await createUser({ isTutorApproved: true });
    const course = await createCourse();

    await createSession({ tutor, course, status: 'Accepted', start: -4, end: 30 });

    expect((await topTutors({ days: 30, limit: 1000 })).find((t) => t.id === tutor.id)).toBeUndefined();
  });
});

describe('sessionHistory', () => {
  it('says how many materials each session has', async () => {
    const tutor = await createUser({ isTutorApproved: true });
    const course = await createCourse();
    const session = await createSession({ tutor, course, status: 'Accepted', start: 90_000, end: 90_060 });
    await prisma.sessionMaterial.create({
      data: { sessionId: session.id, s3Key: `session-materials/${session.id}/a.pdf`, fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 10 },
    });

    const { rows } = await sessionHistory({ limit: 1, offset: 0 });

    expect(rows[0].id).toBe(session.id);
    expect(rows[0].materialsCount).toBe(1);
    expect(rows[0]).not.toHaveProperty('_count');
  });
});
