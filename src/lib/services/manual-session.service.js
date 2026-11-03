/**
 * Manual session service
 *
 * Admin-only flow for tutoring sessions arranged outside Calico. The admin
 * picks a course, one of the tutors offering it and a slot of that tutor's
 * published availability; the price comes from the course. The student is
 * assumed not to be registered, so they stay anonymous: an external user keyed
 * by phone and email, who receives the Meet link by email.
 *
 * The student pays outside the platform once the session is over. Uploading the
 * screenshot of that payment is what moves the payment to `paid` and the session
 * to `Completed`, and only then does it count as revenue and credit the tutor.
 */

import { randomBytes } from 'node:crypto';
import prisma from '../prisma';
import * as s3 from '../s3';
import * as userRepository from '../repositories/user.repository';
import * as sessionRepository from '../repositories/session.repository';
import * as paymentRepository from '../repositories/payment.repository';
import * as academicRepository from '../repositories/academic.repository';
import * as availabilityRepository from '../repositories/availability.repository';
import * as auditService from './admin-audit.service';
import * as calicoCalendar from './calico-calendar.service';
import * as emailService from './email.service';
import { completeSession, sessionConfirmedEmailParams } from './session.service';
import { invalidateAllMetrics } from './admin-metrics.service';
import { normalizePhoneNumber } from '../utils/phone';
import { resolveSessionAmount, PricingError } from '../payments/pricing';
import { buildManualSessionSlots, MANUAL_SLOT_DAYS_AHEAD } from '../availability/manual-session-slots';
import {
  MAX_PROOF_FILE_SIZE,
  PROOF_TYPES,
  isProofKeyOfSession,
  proofFolder,
} from '../payments/manual-payment-proof';

const { ADMIN_ACTIONS } = auditService;

const EXTERNAL_KIND = 'ExternalTemporary';
/** Stored as the name of a student who never registered (DB data, not UI copy). */
export const ANONYMOUS_STUDENT_NAME = 'Anónimo';
/** Older manual sessions could be saved with no email: they got this placeholder domain. */
const PLACEHOLDER_EMAIL_DOMAIN = '@manual.calico.local';

const PROOF_UPLOAD_URL_EXPIRY = 300;
const PROOF_VIEW_URL_EXPIRY = 300;
const MS_PER_DAY = 24 * 60 * 60_000;

function manualError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// ─── Form options ───────────────────────────────────────────────────────

export async function listTutorsForCourse(courseId) {
  return academicRepository.findOfferingTutorsForCourse(courseId);
}

/**
 * What the form may offer for a tutor, and what createManualSession accepts.
 * @see buildManualSessionSlots
 */
export async function getTutorAvailability(tutorId, { now = new Date() } = {}) {
  const [blocks, schedule, sessions] = await Promise.all([
    availabilityRepository.findAvailabilityByUserId(tutorId),
    availabilityRepository.findScheduleByUserId(tutorId),
    // From a day back so the sessions already held today count towards its maximum.
    sessionRepository.findByTutorInRange(
      tutorId,
      new Date(now.getTime() - MS_PER_DAY),
      new Date(now.getTime() + (MANUAL_SLOT_DAYS_AHEAD + 2) * MS_PER_DAY),
    ),
  ]);
  return buildManualSessionSlots({ blocks, schedule, sessions, now });
}

// ─── Listing ────────────────────────────────────────────────────────────

function isExternal(user) {
  return user?.kind === EXTERNAL_KIND;
}

function isPlaceholderEmail(email) {
  return String(email ?? '').endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

/** Explicit shape for the admin: never the S3 key, only whether there is a proof. */
function toManualSessionRow(session) {
  const student = session.participants?.[0]?.student ?? null;
  const payment = session.payments?.[0] ?? null;
  return {
    id: session.id,
    status: session.status,
    startTimestamp: session.startTimestamp,
    endTimestamp: session.endTimestamp,
    meetLink: session.googleMeetLink ?? null,
    course: session.course,
    tutor: session.tutor,
    student: student && {
      name: student.name,
      external: isExternal(student),
      phoneNumber: student.phoneNumber ?? null,
      email: isPlaceholderEmail(student.email) ? null : student.email,
    },
    payment: payment && {
      status: payment.status,
      amount: Number(payment.amount),
      hasProof: Boolean(payment.proofS3Key),
      proofUploadedAt: payment.proofUploadedAt ?? null,
    },
  };
}

export async function listManualSessions({ limit, offset } = {}) {
  const { rows, total } = await sessionRepository.findManualSessions({ limit, offset });
  return { sessions: rows.map(toManualSessionRow), total };
}

// ─── Creation ───────────────────────────────────────────────────────────

/**
 * The account behind this phone and email. A student who already has one keeps
 * it, so the session shows up in their profile; anyone else becomes an anonymous
 * external user. A placeholder never wins over a registered account, and when
 * phone and email point at two different registered people the admin must fix
 * the data: guessing would attach the session to the wrong student.
 */
async function resolveStudent({ phoneNumber, email }) {
  if (!normalizePhoneNumber(phoneNumber)) throw manualError('INVALID_STUDENT_PHONE');

  const [byPhone, byEmail] = await Promise.all([
    userRepository.findByPhoneNumber(phoneNumber),
    userRepository.findByEmail(email),
  ]);

  if (byPhone && byEmail && byPhone.id !== byEmail.id) {
    if (isExternal(byPhone)) return { user: byEmail, created: false };
    if (isExternal(byEmail)) return { user: byPhone, created: false };
    throw manualError('STUDENT_CONTACT_CONFLICT');
  }

  const existing = byPhone ?? byEmail;
  if (existing) {
    // The email is how we reach an external user: keep the latest one on file.
    if (isExternal(existing) && existing.email !== email && !byEmail) {
      return { user: await userRepository.update(existing.id, { email }), created: false };
    }
    return { user: existing, created: false };
  }

  try {
    const user = await userRepository.create({
      name: ANONYMOUS_STUDENT_NAME,
      email,
      phoneNumber,
      passwordHash: null,
      role: 'STUDENT',
      kind: EXTERNAL_KIND,
      isEmailVerified: false,
      terms: false,
    });
    return { user, created: true };
  } catch (err) {
    if (err.code === 'P2002') {
      const user = (await userRepository.findByPhoneNumber(phoneNumber)) ?? (await userRepository.findByEmail(email));
      if (user) return { user, created: false };
    }
    throw err;
  }
}

async function createCalendarEvent(session, studentEmail) {
  const tutor = session.tutor;
  const student = session.participants?.[0]?.student;
  const courseName = session.course?.name || 'Tutoría';

  try {
    const result = await calicoCalendar.createTutoringSessionEvent({
      summary: `Tutoría ${courseName}`,
      description: [
        'Tutoría registrada manualmente por el equipo de Calico.',
        '',
        `Materia: ${courseName}`,
        `Tutor: ${tutor?.name || tutor?.email || session.tutorId}`,
        `Estudiante: ${student?.name || 'Estudiante'}`,
        '',
        `ID de sesión: ${session.id}`,
      ].join('\n'),
      startDateTime: session.startTimestamp,
      endDateTime: session.endTimestamp,
      attendees: [{ email: studentEmail, displayName: student?.name || studentEmail }],
      location: 'Google Meet (enlace adjunto)',
      tutorEmail: tutor?.email || '',
      tutorName: tutor?.name || '',
      tutorId: tutor?.id || session.tutorId,
    });

    if (result.success && result.eventId) {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          googleCalendarEventId: result.eventId,
          googleMeetLink: result.meetLink,
        },
      });
    }

    return result;
  } catch (err) {
    console.warn(`[manual-session] Calendar creation failed for session ${session.id}: ${err.message}`);
    return {
      success: false,
      eventId: null,
      meetLink: null,
      warning: err.message,
    };
  }
}

/**
 * The email is the only way an anonymous student gets the link, so it is awaited
 * and its outcome reported: when it fails the admin must know to send it by hand.
 */
async function sendConfirmationEmails(session, tutor, student, studentEmail) {
  const params = sessionConfirmedEmailParams(session, tutor, {
    name: isExternal(student) ? null : student.name,
  });
  const [toStudent, toTutor] = await Promise.allSettled([
    emailService.sendSessionConfirmedEmail(studentEmail, { recipientName: params.studentName, ...params }),
    emailService.sendSessionConfirmedEmail(tutor.email, { recipientName: tutor.name || '', ...params }),
  ]);
  for (const outcome of [toStudent, toTutor]) {
    if (outcome.status === 'rejected') {
      console.error(`[manual-session] Confirmation email failed for session ${session.id}: ${outcome.reason?.message}`);
    }
  }
  return { student: toStudent.status === 'fulfilled', tutor: toTutor.status === 'fulfilled' };
}

export async function createManualSession({
  adminId,
  tutorId,
  courseId,
  student,
  startTimestamp,
  durationMinutes,
  notes,
  request,
}) {
  const tutor = await userRepository.findById(tutorId);
  if (!tutor?.isTutorApproved || !tutor.isActive) throw manualError('TUTOR_NOT_APPROVED');

  const offering = await academicRepository.findTutorCourse(tutorId, courseId);
  if (offering?.status !== 'Approved') throw manualError('COURSE_NOT_OFFERED');

  const start = new Date(startTimestamp);
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // The same list the form offered, recomputed now: the slot may have been taken.
  const { days, bufferMinutes } = await getTutorAvailability(tutorId);
  const slot = days
    .flatMap((day) => day.slots)
    .find((candidate) => candidate.startTimestamp === start.toISOString());
  if (!slot?.durations.includes(durationMinutes)) throw manualError('SLOT_NOT_AVAILABLE');

  // Server-authoritative price: course price per hour × duration, as in checkout.
  let amount;
  try {
    ({ amount } = await resolveSessionAmount({ courseId, startTimestamp: start, endTimestamp: end }));
  } catch (err) {
    if (err instanceof PricingError) throw manualError(err.code);
    throw err;
  }

  const { user: studentUser, created: createdStudent } = await resolveStudent(student);
  if (studentUser.id === tutorId) throw manualError('SELF_BOOKING');

  const created = await sessionRepository.createSessionWithParticipant(
    {
      courseId,
      tutorId,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: start,
      endTimestamp: end,
      status: 'Accepted',
      locationType: 'Virtual',
      notes: notes || 'Tutoría registrada manualmente por administración.',
      topicsToReview: null,
      source: 'ManualAdmin',
      manualCreatedById: adminId,
    },
    studentUser.id,
    bufferMinutes,
  );

  let session = await sessionRepository.findById(created.id);
  const calendar = await createCalendarEvent(session, student.email);
  session = await sessionRepository.findById(created.id);

  // Manual sessions never carry a coupon: list price = charged = payout base.
  const payment = await paymentRepository.create({
    sessionId: session.id,
    studentId: studentUser.id,
    tutorId,
    amount,
    originalAmount: amount,
    discountAmount: 0,
    tutorPayoutBase: amount,
    status: 'pending',
    wompiId: null,
  });

  const emails = await sendConfirmationEmails(session, tutor, studentUser, student.email);

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.MANUAL_SESSION_CREATE,
    targetType: 'Session',
    targetId: session.id,
    request,
    payload: {
      tutorId,
      courseId,
      studentId: studentUser.id,
      createdStudent,
      studentKind: studentUser.kind,
      paymentId: payment.id,
      paymentStatus: payment.status,
      amount,
      durationMinutes,
      calendarEventId: session.googleCalendarEventId || calendar.eventId || null,
      calendarWarning: calendar.warning || null,
      emails,
    },
  });

  return {
    session: toManualSessionRow(await sessionRepository.findManualSessionById(session.id)),
    createdStudent,
    calendarWarning: calendar.warning || null,
    emails,
  };
}

// ─── Payment proof ──────────────────────────────────────────────────────

async function loadManualPayment(sessionId) {
  const payment = await paymentRepository.findBySessionId(sessionId);
  if (!payment) throw manualError('PAYMENT_NOT_FOUND');
  if (payment.session?.source !== 'ManualAdmin') throw manualError('PAYMENT_IS_NOT_MANUAL');
  return payment;
}

function assertPayable(payment) {
  if (payment.status === 'paid') throw manualError('PAYMENT_ALREADY_PAID');
  if (payment.status !== 'pending' || ['Canceled', 'Rejected'].includes(payment.session?.status)) {
    throw manualError('SESSION_NOT_PAYABLE');
  }
}

/**
 * Presigned PUT for the screenshot. The browser must send the returned
 * `contentType` and `x-amz-tagging: status=unconfirmed`, then register the file
 * with attachPaymentProof; the lifecycle rule cleans what is never registered.
 */
export async function generatePaymentProofUploadUrl({ sessionId, mimeType, fileSize }) {
  const extension = PROOF_TYPES[mimeType];
  if (!extension) throw manualError('PROOF_INVALID_TYPE');
  if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PROOF_FILE_SIZE) {
    throw manualError('PROOF_TOO_LARGE');
  }

  assertPayable(await loadManualPayment(sessionId));

  const s3Key = `${proofFolder(sessionId)}${randomBytes(6).toString('hex')}.${extension}`;
  const uploadUrl = await s3.generateUploadUrl(s3Key, mimeType, {
    expiresIn: PROOF_UPLOAD_URL_EXPIRY,
    contentLength: fileSize,
    tagging: 'status=unconfirmed',
  });
  return { uploadUrl, s3Key, contentType: mimeType };
}

/**
 * A paid session that already ended is over. One whose proof arrives early stays
 * Accepted: it reaches the tutor's payouts on its own once it ends, by date, and
 * the same rule covers this step failing, so that never undoes the payment.
 */
async function completeIfOver(sessionId, payment) {
  const { status, endTimestamp } = payment.session;
  if (status !== 'Accepted' || new Date(endTimestamp).getTime() > Date.now()) return;
  try {
    const row = await sessionRepository.findManualSessionById(sessionId);
    await completeSession(sessionId, payment.tutorId, {
      withReviews: !isExternal(row?.participants?.[0]?.student),
    });
  } catch (err) {
    console.error(`[manual-session] Failed to complete session ${sessionId}: ${err.message}`);
  }
}

/**
 * Store the uploaded screenshot, mark the payment as paid and complete the
 * session: from here on it counts as revenue and is credited to the tutor.
 * Retrying with the same file is a no-op, so a lost response cannot fail or
 * credit twice.
 */
export async function attachPaymentProof({ sessionId, s3Key, adminId, request }) {
  const payment = await loadManualPayment(sessionId);
  const alreadyDone = () => payment.status === 'paid' && payment.proofS3Key === s3Key;

  if (!alreadyDone()) {
    assertPayable(payment);
    if (!isProofKeyOfSession(s3Key, sessionId)) throw manualError('PROOF_KEY_INVALID');

    let head;
    try {
      head = await s3.headObject(s3Key);
    } catch (err) {
      if (err.code === 'NOT_FOUND') throw manualError('PROOF_NOT_UPLOADED');
      throw err;
    }
    if (!PROOF_TYPES[head.contentType]) throw manualError('PROOF_INVALID_TYPE');
    if (typeof head.contentLength === 'number' && head.contentLength > MAX_PROOF_FILE_SIZE) {
      throw manualError('PROOF_TOO_LARGE');
    }

    const updated = await paymentRepository.markManualPaymentPaid(payment.id, {
      tutorId: payment.tutorId,
      tutorPayoutBase: Number(payment.tutorPayoutBase ?? payment.amount),
      proofS3Key: s3Key,
    });
    if (!updated) throw manualError('PAYMENT_ALREADY_PAID');

    await completeIfOver(sessionId, payment);
    invalidateAllMetrics();

    // Awaited: an object left as `unconfirmed` would be deleted by the lifecycle
    // rule, and this file is the only evidence of the payment.
    try {
      await s3.setObjectTags(s3Key, { status: 'confirmed' });
    } catch (err) {
      console.error(`[manual-session] Failed to confirm the proof tag of session ${sessionId}: ${err.message}`);
    }

    await auditService.logAction({
      adminId,
      action: ADMIN_ACTIONS.MANUAL_SESSION_PAYMENT_CONFIRM,
      targetType: 'Payment',
      targetId: payment.id,
      request,
      payload: {
        sessionId,
        tutorId: payment.tutorId,
        studentId: payment.studentId,
        amount: Number(payment.amount),
        proofS3Key: s3Key,
      },
    });
  }

  return toManualSessionRow(await sessionRepository.findManualSessionById(sessionId));
}

/** Short-lived URL to look at the proof; the bucket prefix is private. */
export async function getPaymentProofUrl({ sessionId }) {
  const payment = await loadManualPayment(sessionId);
  if (!payment.proofS3Key) throw manualError('PROOF_NOT_FOUND');
  return s3.generateDownloadUrl(payment.proofS3Key, PROOF_VIEW_URL_EXPIRY);
}
