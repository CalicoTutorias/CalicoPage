import prisma from '../prisma';
import crypto from 'crypto';

const ACTIVE_PENDING_SQL = `"notified_at" IS NULL AND "cancelled_at" IS NULL`;

function statusFromRow(row) {
  if (row.cancelledAt) return 'cancelled';
  if (row.notifiedAt) return 'notified';
  return 'pending';
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    notificationEmail: row.notificationEmail,
    source: row.source,
    notifiedAt: row.notifiedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    courseName: row.courseName,
    courseCode: row.courseCode,
    status: statusFromRow(row),
  };
}

export async function countAvailableTutorsForCourse(courseId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT tc.tutor_id)::int AS count
    FROM tutor_courses tc
    JOIN tutor_profiles tp ON tp.user_id = tc.tutor_id
    JOIN users u ON u.id = tp.user_id
    JOIN availabilities a ON a.user_id = tc.tutor_id
    WHERE tc.course_id = ${courseId}
      AND tc.status = 'Approved'
      AND u.is_tutor_approved = true
      AND u.is_active = true
      AND (
        a.recurring = true
        OR a.specific_date >= ${today}
      )
  `;

  return Number(rows?.[0]?.count ?? 0);
}

export async function countAvailableTutorsForCourses(courseIds) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) return new Map();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const placeholders = courseIds.map((_, index) => `$${index + 2}`).join(', ');

  const rows = await prisma.$queryRawUnsafe(`
    SELECT tc.course_id AS "courseId", COUNT(DISTINCT tc.tutor_id)::int AS count
    FROM tutor_courses tc
    JOIN tutor_profiles tp ON tp.user_id = tc.tutor_id
    JOIN users u ON u.id = tp.user_id
    JOIN availabilities a ON a.user_id = tc.tutor_id
    WHERE tc.course_id IN (${placeholders})
      AND tc.status = 'Approved'
      AND u.is_tutor_approved = true
      AND u.is_active = true
      AND (
        a.recurring = true
        OR a.specific_date >= $1
      )
    GROUP BY tc.course_id
  `, today, ...courseIds);

  return new Map(rows.map((row) => [row.courseId, Number(row.count ?? 0)]));
}

export async function findPendingByStudentAndCourse(studentId, courseId) {
  const rows = await prisma.$queryRaw`
    SELECT
      id,
      student_id AS "studentId",
      course_id AS "courseId",
      notification_email AS "notificationEmail",
      source,
      notified_at AS "notifiedAt",
      cancelled_at AS "cancelledAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM course_notify_subscriptions
    WHERE student_id = ${studentId}
      AND course_id = ${courseId}
      AND notified_at IS NULL
      AND cancelled_at IS NULL
    LIMIT 1
  `;

  return mapSubscription(rows?.[0]);
}

export async function createPendingSubscription({ studentId, courseId, notificationEmail, source }) {
  const id = crypto.randomUUID();
  const rows = await prisma.$queryRaw`
    INSERT INTO course_notify_subscriptions (
      id,
      student_id,
      course_id,
      notification_email,
      source,
      updated_at
    )
    VALUES (
      ${id},
      ${studentId},
      ${courseId},
      ${notificationEmail},
      ${source || 'unknown'},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT DO NOTHING
    RETURNING
      id,
      student_id AS "studentId",
      course_id AS "courseId",
      notification_email AS "notificationEmail",
      source,
      notified_at AS "notifiedAt",
      cancelled_at AS "cancelledAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  return mapSubscription(rows?.[0]);
}

export async function findPendingByCourse(courseId) {
  const rows = await prisma.$queryRaw`
    SELECT
      s.id,
      s.student_id AS "studentId",
      s.course_id AS "courseId",
      s.notification_email AS "notificationEmail",
      s.source,
      s.notified_at AS "notifiedAt",
      s.cancelled_at AS "cancelledAt",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      u.name AS "studentName",
      u.email AS "studentEmail",
      c.name AS "courseName",
      c.code AS "courseCode"
    FROM course_notify_subscriptions s
    JOIN users u ON u.id = s.student_id
    JOIN courses c ON c.id = s.course_id
    WHERE s.course_id = ${courseId}
      AND s.notified_at IS NULL
      AND s.cancelled_at IS NULL
    ORDER BY s.created_at ASC
  `;

  return rows.map(mapSubscription);
}

export async function markNotified(subscriptionId) {
  const rows = await prisma.$queryRaw`
    UPDATE course_notify_subscriptions
    SET notified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${subscriptionId}
      AND notified_at IS NULL
      AND cancelled_at IS NULL
    RETURNING
      id,
      student_id AS "studentId",
      course_id AS "courseId",
      notification_email AS "notificationEmail",
      source,
      notified_at AS "notifiedAt",
      cancelled_at AS "cancelledAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  return mapSubscription(rows?.[0]);
}

export async function findApprovedCourseIdsForTutor(tutorId) {
  const rows = await prisma.$queryRaw`
    SELECT course_id AS "courseId"
    FROM tutor_courses
    WHERE tutor_id = ${tutorId}
      AND status = 'Approved'
  `;

  return rows.map((row) => row.courseId);
}

export async function findApprovedCourseIdsWithPendingSubscriptions(tutorId) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT tc.course_id AS "courseId"
    FROM tutor_courses tc
    JOIN course_notify_subscriptions s ON s.course_id = tc.course_id
    WHERE tc.tutor_id = ${tutorId}
      AND tc.status = 'Approved'
      AND s.notified_at IS NULL
      AND s.cancelled_at IS NULL
  `;

  return rows.map((row) => row.courseId);
}

export async function listAdminSubscriptions({ status, limit = 100 } = {}) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 250);
  let statusFilter = '';
  if (status === 'pending') statusFilter = `AND s.${ACTIVE_PENDING_SQL}`;
  if (status === 'notified') statusFilter = 'AND s.notified_at IS NOT NULL';
  if (status === 'cancelled') statusFilter = 'AND s.cancelled_at IS NOT NULL';

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      s.id,
      s.student_id AS "studentId",
      s.course_id AS "courseId",
      s.notification_email AS "notificationEmail",
      s.source,
      s.notified_at AS "notifiedAt",
      s.cancelled_at AS "cancelledAt",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      u.name AS "studentName",
      u.email AS "studentEmail",
      c.name AS "courseName",
      c.code AS "courseCode"
    FROM course_notify_subscriptions s
    JOIN users u ON u.id = s.student_id
    JOIN courses c ON c.id = s.course_id
    WHERE 1 = 1
      ${statusFilter}
    ORDER BY s.created_at DESC
    LIMIT $1
  `, normalizedLimit);

  return rows.map(mapSubscription);
}

export async function getAdminMetrics() {
  const [summaryRows, topCourses] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE notified_at IS NULL AND cancelled_at IS NULL)::int AS pending,
        COUNT(*) FILTER (WHERE notified_at IS NOT NULL)::int AS notified,
        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL)::int AS cancelled,
        (
          AVG(EXTRACT(EPOCH FROM (notified_at - created_at)) / 3600)
          FILTER (WHERE notified_at IS NOT NULL)
        )::float AS "avgHoursToNotify"
      FROM course_notify_subscriptions
    `,
    prisma.$queryRaw`
      SELECT
        c.id AS "courseId",
        c.name AS "courseName",
        c.code AS "courseCode",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE s.notified_at IS NULL AND s.cancelled_at IS NULL)::int AS pending
      FROM course_notify_subscriptions s
      JOIN courses c ON c.id = s.course_id
      GROUP BY c.id, c.name, c.code
      ORDER BY pending DESC, total DESC, c.name ASC
      LIMIT 10
    `,
  ]);

  return {
    summary: summaryRows?.[0] || {
      total: 0,
      pending: 0,
      notified: 0,
      cancelled: 0,
      avgHoursToNotify: null,
    },
    topCourses,
  };
}
