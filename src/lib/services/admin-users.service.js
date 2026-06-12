/**
 * Admin Users Service
 *
 * Powers the admin "Usuarios" directory: a searchable list of every user
 * (student, tutor, admin) and a per-user profile with activity stats.
 *
 * SECURITY: every consumer route is gated by requireAdminUser. On top of
 * that, this service NEVER selects sensitive columns (passwordHash, OTP /
 * verification / reset tokens) — each Prisma `select` is an explicit
 * allow-list, mirroring user.repository's SENSITIVE_FIELDS policy.
 *
 * Money math (tutor's 85% share) goes through src/lib/payments/fees.js.
 */

import prisma from '../prisma';
import * as statsRepo from '../repositories/admin-users.repository';
import * as studentReviewRepo from '../repositories/student-review.repository';
import * as reviewRepo from '../repositories/review.repository';
import { tutorPayout } from '../payments/fees';

// Allow-list of safe identity fields for list rows. studentRating /
// studentRatingCount are private app-wide but deliberately visible here:
// every consumer route is behind requireAdminUser and the directory's
// best/worst-rating sort needs them on the row.
const LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  phoneNumber: true,
  profilePictureUrl: true,
  role: true,
  isTutorApproved: true,
  isTutorRequested: true,
  isActive: true,
  isEmailVerified: true,
  createdAt: true,
  studentRating: true,
  studentRatingCount: true,
  career: { select: { id: true, name: true, code: true } },
  tutorProfile: { select: { review: true, numReview: true, numSessions: true } },
};

// Allow-list of safe fields for the full profile (adds contact / payout
// fields an admin legitimately needs, still no secrets).
const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  phoneNumber: true,
  profilePictureUrl: true,
  role: true,
  authProvider: true,
  isTutorRequested: true,
  isTutorApproved: true,
  isActive: true,
  isEmailVerified: true,
  terms: true,
  suspendedAt: true,
  suspendedReason: true,
  createdAt: true,
  updatedAt: true,
  // Private student rating (tutor→estudiante): admins see it deliberately —
  // it powers moderation / suspension for low ratings.
  studentRating: true,
  studentRatingCount: true,
  career: { select: { id: true, name: true, code: true, department: { select: { id: true, name: true } } } },
  tutorProfile: {
    select: {
      schoolEmail: true,
      llave: true,
      bio: true,
      experienceYears: true,
      experienceDescription: true,
      review: true,
      numReview: true,
      numSessions: true,
      totalEarning: true,
      nextPayment: true,
      credits: true,
      updatedAt: true,
    },
  },
  _count: {
    select: {
      tutorSessions: true,
      participations: true,
      reviewsWritten: true,
      reviewsReceived: true,
    },
  },
};

/**
 * Build the WHERE clause for the list from a role filter + free-text search.
 */
function buildWhere({ role = 'all', search } = {}) {
  const where = {};
  if (search) {
    where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  switch (role) {
    case 'students':  where.isTutorApproved = false; where.role = 'STUDENT'; break;
    case 'tutors':    where.isTutorApproved = true; break;
    case 'admins':    where.role = 'ADMIN'; break;
    case 'suspended': where.isActive = false; break;
    case 'all':
    default:          break;
  }
  return where;
}

/**
 * Sort modes for the directory. The rating sorts rank by the denormalized
 * aggregates and EXCLUDE users with zero ratings on that side — a 0-review
 * default of 0.00 would otherwise pollute "worst rated" with brand-new users.
 * `where` is merged on top of the role/search filter; `orderBy` always has a
 * createdAt tie-breaker so pagination stays deterministic.
 */
const LIST_SORTS = {
  recent: {
    orderBy: [{ createdAt: 'desc' }],
  },
  tutorBest: {
    where: { tutorProfile: { numReview: { gt: 0 } } },
    orderBy: [{ tutorProfile: { review: 'desc' } }, { createdAt: 'desc' }],
  },
  tutorWorst: {
    where: { tutorProfile: { numReview: { gt: 0 } } },
    orderBy: [{ tutorProfile: { review: 'asc' } }, { createdAt: 'desc' }],
  },
  studentBest: {
    where: { studentRatingCount: { gt: 0 } },
    orderBy: [{ studentRating: 'desc' }, { createdAt: 'desc' }],
  },
  studentWorst: {
    where: { studentRatingCount: { gt: 0 } },
    orderBy: [{ studentRating: 'asc' }, { createdAt: 'desc' }],
  },
};

export const LIST_SORT_KEYS = Object.keys(LIST_SORTS);

/**
 * Paginated, searchable list of users. `search` matches name OR email
 * (case-insensitive); `role` is one of all|students|tutors|admins|suspended;
 * `sort` is one of LIST_SORT_KEYS (default `recent`).
 */
export async function listUsers({ role = 'all', search, sort = 'recent', limit = 50, offset = 0 } = {}) {
  const sortSpec = LIST_SORTS[sort] || LIST_SORTS.recent;
  const where = {
    ...buildWhere({ role, search: search?.trim() || undefined }),
    ...(sortSpec.where || {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: sortSpec.orderBy,
      take: Math.max(1, Math.min(limit, 200)),
      skip: Math.max(0, offset),
      select: LIST_SELECT,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

const monthKey = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Merge the two raw monthly arrays onto a continuous axis of the last
 * `months` months so the chart has no gaps. Output:
 *   [{ month: ISOString, asTutor, asStudent }]
 */
function buildActivitySeries({ tutor, student }, months = 12) {
  const tutorByMonth   = new Map(tutor.map((r) => [monthKey(r.month), r.n]));
  const studentByMonth = new Map(student.map((r) => [monthKey(r.month), r.n]));

  const series = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(d);
    series.push({
      month:     d.toISOString(),
      asTutor:   tutorByMonth.get(key) ?? 0,
      asStudent: studentByMonth.get(key) ?? 0,
    });
  }
  return series;
}

/**
 * Full admin profile for one user: safe identity fields, the subjects they
 * tutor ("tutor de…"), activity stats as both student and tutor, a 12-month
 * activity series, and the most recent sessions on each side.
 *
 * Returns null when the user doesn't exist.
 */
export async function getUserProfile(userId) {
  const id = String(userId ?? '').trim();
  if (!id) return null;

  const user = await prisma.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  if (!user) return null;

  const [
    tutorCourses,
    sessionsAsTutor,
    sessionsAsStudent,
    tutorStats,
    studentStats,
    financial,
    activityRaw,
    studentReviewsReceived,
  ] = await Promise.all([
    prisma.tutorCourse.findMany({
      where: { tutorId: id },
      include: { course: { select: { id: true, code: true, name: true } } },
    }),
    prisma.session.findMany({
      where: { tutorId: id },
      orderBy: { startTimestamp: 'desc' },
      take: 8,
      select: {
        id: true, status: true, startTimestamp: true, sessionType: true,
        course: { select: { id: true, code: true, name: true } },
        participants: { select: { student: { select: { id: true, name: true } } } },
      },
    }),
    prisma.session.findMany({
      where: { participants: { some: { studentId: id } } },
      orderBy: { startTimestamp: 'desc' },
      take: 8,
      select: {
        id: true, status: true, startTimestamp: true, sessionType: true,
        course: { select: { id: true, code: true, name: true } },
        tutor: { select: { id: true, name: true } },
      },
    }),
    statsRepo.tutorSessionStats(id),
    statsRepo.studentSessionStats(id),
    statsRepo.financialStats(id),
    statsRepo.monthlyActivity(id, 12),
    // Moderation view: comments included — admin-only by the route guard.
    studentReviewRepo.findReceivedByStudent(id, 20),
  ]);

  // Reviews received as TUTOR (the public student→tutor direction, with
  // comments) so the admin sees behaviour on both sides of the marketplace.
  // Outside Promise.all to keep the failure mode isolated: an empty list is
  // fine for non-tutors.
  const tutorReviewsReceived = user.isTutorApproved
    ? await reviewRepo.findReviewsReceived(id, 20)
    : [];

  return {
    user,
    tutorCourses,
    sessionsAsTutor,
    sessionsAsStudent,
    studentReviewsReceived,
    tutorReviewsReceived,
    activitySeries: buildActivitySeries(activityRaw, 12),
    stats: {
      asTutor: {
        ...tutorStats,
        earned:        Number(tutorPayout(financial.earnedGross).toFixed(2)),
        earnedPending: Number(tutorPayout(financial.earnedGrossPending).toFixed(2)),
        payments:      financial.earnedPayments,
        reviewsReceived: user._count?.reviewsReceived ?? 0,
      },
      asStudent: {
        ...studentStats,
        spent:           Number(financial.spentGross.toFixed(2)),
        payments:        financial.spentPayments,
        reviewsWritten:  user._count?.reviewsWritten ?? 0,
        rating:          Number(user.studentRating) || 0,
        ratingCount:     user.studentRatingCount ?? 0,
      },
    },
  };
}
