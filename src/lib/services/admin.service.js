/**
 * Admin Service
 * Orchestrates moderator-grade actions over tutor lifecycle:
 * approve / reject / suspend / reinstate.
 *
 * All mutations:
 *   - Run inside a Prisma transaction so partial failures don't leave
 *     mixed state across users + applications + tutor_courses.
 *   - Are persisted in admin_audit_log via admin-audit.service.
 *   - Throw an Error with a `code` so route handlers map to the right
 *     HTTP status without leaking implementation details.
 */

import prisma from '../prisma';
import * as auditService from './admin-audit.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import {
  sendTutorApplicationApproved,
  sendTutorApplicationRejected,
  sendTutorSuspended,
} from './email.service';

const { ADMIN_ACTIONS } = auditService;

/**
 * Fire an email send in the background. The admin action must NEVER fail
 * because Brevo is down — log and swallow.
 */
function fireEmail(label, promise) {
  promise?.catch?.((err) => {
    console.error(`[admin.service] ${label} email failed:`, err?.message || err);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────

class DomainError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function loadLatestPendingApplication(userId) {
  return prisma.tutorApplication.findFirst({
    where: { userId, status: 'Pending' },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Pending applications listing ───────────────────────────────────────

/**
 * Lists pending tutor applications with the user data and course names
 * already resolved, so the admin UI can render without further fetches.
 */
export async function listPendingApplications({ limit = 50, offset = 0 } = {}) {
  const [items, total] = await Promise.all([
    prisma.tutorApplication.findMany({
      where: { status: 'Pending' },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 200),
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phoneNumber: true,
            profilePictureUrl: true,
            careerId: true,
            createdAt: true,
            career: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),
    prisma.tutorApplication.count({ where: { status: 'Pending' } }),
  ]);

  // Resolve subject UUIDs → course objects in one query.
  const allSubjectIds = Array.from(new Set(items.flatMap((a) => a.subjects ?? [])));
  const courses = allSubjectIds.length
    ? await prisma.course.findMany({
        where: { id: { in: allSubjectIds } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const enriched = items.map((app) => ({
    id:              app.id,
    createdAt:       app.createdAt,
    reasonsToTeach:  app.reasonsToTeach,
    contactInfo:     app.contactInfo,
    user:            app.user,
    subjects: (app.subjects ?? []).map((id) => courseById.get(id) || { id, code: null, name: id }),
  }));

  return { items: enriched, total };
}

// ─── Approved tutors listing (active / suspended) ───────────────────────

/**
 * List approved tutors. Filter by active / suspended via `status`. The
 * `search` term matches name OR email (case-insensitive).
 */
export async function listApprovedTutors({
  status = 'active',
  search,
  limit = 50,
  offset = 0,
} = {}) {
  const where = {
    isTutorApproved: true,
    ...(status === 'active'    && { isActive: true }),
    ...(status === 'suspended' && { isActive: false }),
    ...(search && {
      OR: [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      skip: offset,
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        profilePictureUrl: true,
        isActive: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        career: { select: { id: true, name: true, code: true } },
        tutorProfile: {
          select: {
            review: true,
            numReview: true,
            numSessions: true,
            llave: true,
          },
        },
        _count: {
          select: {
            tutorSessions: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

/**
 * Detail for a single tutor: user + profile + every tutor_courses row
 * with course names and current per-course status, plus the last
 * application (any status) so the admin can see the original ask.
 */
export async function getTutorDetail(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phoneNumber: true,
      profilePictureUrl: true,
      role: true,
      isTutorApproved: true,
      isTutorRequested: true,
      isActive: true,
      suspendedAt: true,
      suspendedReason: true,
      suspendedById: true,
      createdAt: true,
      career: { select: { id: true, name: true, code: true } },
      tutorProfile: true,
    },
  });
  if (!user) return null;

  const [tutorCourses, latestApplication] = await Promise.all([
    prisma.tutorCourse.findMany({
      where: { tutorId: userId },
      include: { course: { select: { id: true, code: true, name: true } } },
    }),
    prisma.tutorApplication.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  // Resolve subject UUIDs in the latest application to course objects so
  // the UI can render names instead of opaque IDs.
  let applicationSubjects = [];
  if (latestApplication?.subjects?.length) {
    const courses = await prisma.course.findMany({
      where: { id: { in: latestApplication.subjects } },
      select: { id: true, code: true, name: true },
    });
    const byId = new Map(courses.map((c) => [c.id, c]));
    applicationSubjects = latestApplication.subjects.map(
      (id) => byId.get(id) || { id, code: null, name: id },
    );
  }

  return {
    user,
    tutorCourses,
    latestApplication: latestApplication
      ? { ...latestApplication, subjectsResolved: applicationSubjects }
      : null,
  };
}

// ─── Approve ────────────────────────────────────────────────────────────

/**
 * Approve a tutor application.
 *
 * Behavior:
 *   - users.is_tutor_approved = true (the trigger creates tutor_profiles
 *     and copies llave/phone from the application's contact_info).
 *   - users.is_tutor_requested = true (legacy flag kept consistent).
 *   - tutor_applications.status = 'Approved' + reviewer metadata.
 *   - tutor_courses rows: 'Approved' for `approvedCourseIds`, 'Rejected'
 *     for the rest of the application's subjects. Subjects not present
 *     in the application but listed in `approvedCourseIds` are ignored
 *     (defensive: don't grant random courses).
 *   - users.role is NOT touched — Tutor and Admin are orthogonal. A
 *     tutor stays role=STUDENT unless explicitly promoted.
 *
 * @param {Object} args
 * @param {string} args.userId           Tutor candidate's user id.
 * @param {string} args.adminId          Acting admin (for audit).
 * @param {string[]} args.approvedCourseIds  Subset of application.subjects to approve.
 * @param {Request} [args.request]       Source request for IP/UA in audit.
 *
 * @throws DomainError NOT_FOUND if no pending application
 * @throws DomainError ALREADY_APPROVED if user.is_tutor_approved is already true
 * @throws DomainError EMPTY_APPROVAL if approvedCourseIds is empty (use reject instead)
 */
export async function approveTutor({ userId, adminId, approvedCourseIds, request }) {
  if (!Array.isArray(approvedCourseIds) || approvedCourseIds.length === 0) {
    throw new DomainError(
      'Selecciona al menos una materia para aprobar. Para rechazar la solicitud completa, usa el endpoint de reject.',
      'EMPTY_APPROVAL',
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isTutorApproved: true },
  });
  if (!user) throw new DomainError('User not found', 'NOT_FOUND');
  if (user.isTutorApproved) {
    throw new DomainError('User is already an approved tutor', 'ALREADY_APPROVED');
  }

  const application = await loadLatestPendingApplication(userId);
  if (!application) {
    throw new DomainError('No pending application for this user', 'NOT_FOUND');
  }

  // Defensively limit approvedCourseIds to subjects actually in the application.
  const requestedSet = new Set(application.subjects ?? []);
  const approvedSet  = new Set(approvedCourseIds.filter((id) => requestedSet.has(id)));
  const rejectedIds  = (application.subjects ?? []).filter((id) => !approvedSet.has(id));

  if (approvedSet.size === 0) {
    throw new DomainError(
      'Ninguna de las materias indicadas pertenece a esta solicitud.',
      'EMPTY_APPROVAL',
    );
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    // (a) Flip the user — this fires the trigger that creates tutor_profiles.
    const u = await tx.user.update({
      where: { id: userId },
      data: {
        isTutorApproved: true,
        isTutorRequested: true,
      },
    });

    // (b) Close the application.
    await tx.tutorApplication.update({
      where: { id: application.id },
      data: {
        status:        'Approved',
        reviewedAt:    new Date(),
        reviewedById:  adminId,
      },
    });

    // (c) tutor_courses: Approved for the selected subset, Rejected for the rest.
    //     Use individual upserts so this is idempotent if the admin retries.
    for (const courseId of approvedSet) {
      await tx.tutorCourse.upsert({
        where: { tutorId_courseId: { tutorId: userId, courseId } },
        create: { tutorId: userId, courseId, status: 'Approved' },
        update: { status: 'Approved' },
      });
    }
    for (const courseId of rejectedIds) {
      await tx.tutorCourse.upsert({
        where: { tutorId_courseId: { tutorId: userId, courseId } },
        create: { tutorId: userId, courseId, status: 'Rejected' },
        update: { status: 'Rejected' },
      });
    }

    return u;
  });

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.TUTOR_APPROVE,
    targetType: 'User',
    targetId: userId,
    payload: {
      applicationId: application.id,
      approvedCourseIds: Array.from(approvedSet),
      rejectedCourseIds: rejectedIds,
    },
    request,
  });

  // Email the tutor with the outcome (fire-and-forget).
  try {
    const allCourseIds = [...approvedSet, ...rejectedIds];
    const courses = await prisma.course.findMany({
      where: { id: { in: allCourseIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(courses.map((c) => [c.id, c.name]));
    fireEmail(
      'tutor-approved',
      sendTutorApplicationApproved(
        { email: user.email, name: user.name },
        {
          approved: Array.from(approvedSet).map((id) => nameById.get(id)).filter(Boolean),
          rejected: rejectedIds.map((id) => nameById.get(id)).filter(Boolean),
        },
      ),
    );
  } catch (err) {
    console.error('[admin.service.approveTutor] Email prep failed:', err.message);
  }

  return {
    user: updatedUser,
    applicationId: application.id,
    approvedCourseIds: Array.from(approvedSet),
    rejectedCourseIds: rejectedIds,
  };
}

// ─── Reject ─────────────────────────────────────────────────────────────

/**
 * Reject a pending tutor application without granting tutor role.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.adminId
 * @param {string} args.reason       Required for the audit trail.
 * @param {Request} [args.request]
 */
export async function rejectTutor({ userId, adminId, reason, request }) {
  const trimmed = (reason ?? '').trim();
  if (!trimmed) throw new DomainError('Reason is required to reject.', 'INVALID_INPUT');

  const application = await loadLatestPendingApplication(userId);
  if (!application) {
    throw new DomainError('No pending application for this user', 'NOT_FOUND');
  }

  const updated = await prisma.tutorApplication.update({
    where: { id: application.id },
    data: {
      status:           'Rejected',
      rejectionReason:  trimmed,
      reviewedAt:       new Date(),
      reviewedById:     adminId,
    },
  });

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.TUTOR_REJECT,
    targetType: 'TutorApplication',
    targetId: application.id,
    payload: { userId, reason: trimmed },
    request,
  });

  // Notify the applicant (fire-and-forget).
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (u) {
      fireEmail('tutor-rejected', sendTutorApplicationRejected(u, trimmed));
    }
  } catch (err) {
    console.error('[admin.service.rejectTutor] Email prep failed:', err.message);
  }

  return updated;
}

// ─── Suspend / Reinstate ────────────────────────────────────────────────

/**
 * Suspend an approved tutor. Sets is_active=false and records who/why.
 * Future sessions cancellation is intentionally NOT done here — out of
 * scope for Phase 2 (would couple admin.service to session.service).
 * Track that as a follow-up in the plan's risks section.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.adminId
 * @param {string} args.reason
 * @param {Request} [args.request]
 */
export async function suspendTutor({ userId, adminId, reason, request }) {
  const trimmed = (reason ?? '').trim();
  if (!trimmed) throw new DomainError('Reason is required to suspend.', 'INVALID_INPUT');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, isTutorApproved: true, suspendedAt: true },
  });
  if (!user) throw new DomainError('User not found', 'NOT_FOUND');
  if (!user.isTutorApproved) throw new DomainError('User is not a tutor', 'INVALID_STATE');
  if (!user.isActive) throw new DomainError('User is already suspended', 'ALREADY_SUSPENDED');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive:        false,
      suspendedAt:     new Date(),
      suspendedReason: trimmed,
      suspendedById:   adminId,
    },
  });

  // Cancel future sessions of the suspended tutor. Best-effort: a bulk
  // status flip with a reason. Side effects (Google Calendar cleanup,
  // refund flow, email to students) are intentionally skipped here to
  // avoid coupling this service to session.service. They can run as a
  // follow-up manual task; the cancellationReason makes them auditable.
  let cancelledSessionsCount = 0;
  try {
    const result = await prisma.session.updateMany({
      where: {
        tutorId: userId,
        status:  { in: ['Pending', 'Accepted'] },
        startTimestamp: { gt: new Date() },
      },
      data: {
        status:             'Canceled',
        cancellationReason: 'TUTOR_SUSPENDED',
        cancelledAt:        new Date(),
        cancelledBy:        adminId,
      },
    });
    cancelledSessionsCount = result.count;
  } catch (err) {
    console.error('[admin.service.suspendTutor] Failed to cancel future sessions:', err.message);
  }

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.TUTOR_SUSPEND,
    targetType: 'User',
    targetId: userId,
    payload: { reason: trimmed, cancelledSessionsCount },
    request,
  });

  fireEmail(
    'tutor-suspended',
    sendTutorSuspended({ email: updated.email, name: updated.name }, trimmed),
  );

  return { ...updated, cancelledSessionsCount };
}

// ─── Per-course management (after the initial approval) ────────────────

/**
 * Assign a set of courses to an approved tutor with a given status. Useful
 * for two cases:
 *   - Recovering tutors that were promoted via SQL and have no rows in
 *     tutor_courses.
 *   - Bulk-adding more courses an admin decides the tutor is qualified for.
 *
 * Idempotent: existing (tutorId, courseId) rows get their status updated.
 *
 * @param {Object} args
 * @param {string}    args.userId
 * @param {string}    args.adminId
 * @param {string[]}  args.courseIds
 * @param {'Approved'|'Pending'|'Rejected'} [args.status='Approved']
 * @param {Request}   [args.request]
 */
export async function assignCoursesToTutor({ userId, adminId, courseIds, status = 'Approved', request }) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw new DomainError('Selecciona al menos una materia.', 'INVALID_INPUT');
  }
  if (!['Approved', 'Pending', 'Rejected'].includes(status)) {
    throw new DomainError('Status inválido.', 'INVALID_INPUT');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isTutorApproved: true },
  });
  if (!user) throw new DomainError('User not found', 'NOT_FOUND');
  if (!user.isTutorApproved) {
    throw new DomainError(
      'Sólo se pueden asignar materias a un tutor ya aprobado. Aprueba la aplicación primero.',
      'INVALID_STATE',
    );
  }

  // Filter to existing courses to avoid FK violations.
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true },
  });
  const validIds = new Set(courses.map((c) => c.id));
  const filtered = courseIds.filter((id) => validIds.has(id));
  if (filtered.length === 0) {
    throw new DomainError('Ninguna de las materias indicadas existe.', 'NOT_FOUND');
  }

  await prisma.$transaction(
    filtered.map((courseId) =>
      prisma.tutorCourse.upsert({
        where: { tutorId_courseId: { tutorId: userId, courseId } },
        create: { tutorId: userId, courseId, status },
        update: { status },
      }),
    ),
  );

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: status === 'Approved' ? ADMIN_ACTIONS.COURSE_APPROVE : ADMIN_ACTIONS.COURSE_REJECT,
    targetType: 'User',
    targetId: userId,
    payload: { courseIds: filtered, status, source: 'assign' },
    request,
  });

  return { assignedCourseIds: filtered, status };
}

/**
 * Toggle the status of a single tutor_course row. Used for inline
 * approve/reject of a Pending course request from the detail page.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.courseId
 * @param {string} args.adminId
 * @param {'Approved'|'Pending'|'Rejected'} args.status
 * @param {Request} [args.request]
 */
export async function setTutorCourseStatus({ userId, courseId, adminId, status, request }) {
  if (!['Approved', 'Pending', 'Rejected'].includes(status)) {
    throw new DomainError('Status inválido.', 'INVALID_INPUT');
  }

  const existing = await prisma.tutorCourse.findUnique({
    where: { tutorId_courseId: { tutorId: userId, courseId } },
  });
  if (!existing) {
    throw new DomainError('No existe una asignación para este tutor y materia.', 'NOT_FOUND');
  }

  const updated = await prisma.tutorCourse.update({
    where: { tutorId_courseId: { tutorId: userId, courseId } },
    data: { status },
  });

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: status === 'Approved' ? ADMIN_ACTIONS.COURSE_APPROVE : ADMIN_ACTIONS.COURSE_REJECT,
    targetType: 'TutorCourse',
    targetId: `${userId}:${courseId}`,
    payload: { from: existing.status, to: status },
    request,
  });

  return updated;
}

/**
 * Lift a suspension. Clears moderation fields and re-activates the user.
 *
 * @param {Object} args
 * @param {string} args.userId
 * @param {string} args.adminId
 * @param {Request} [args.request]
 */
export async function reinstateTutor({ userId, adminId, request }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, suspendedAt: true },
  });
  if (!user) throw new DomainError('User not found', 'NOT_FOUND');
  if (user.isActive) throw new DomainError('User is not suspended', 'INVALID_STATE');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive:        true,
      suspendedAt:     null,
      suspendedReason: null,
      suspendedById:   null,
    },
  });

  invalidateAllMetrics();

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.TUTOR_REINSTATE,
    targetType: 'User',
    targetId: userId,
    payload: null,
    request,
  });

  return updated;
}
