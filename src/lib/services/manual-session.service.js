/**
 * Manual session service
 *
 * Admin-only flow for recording tutoring sessions scheduled outside Calico.
 * Students are still represented as normal users; if a phone number does not
 * match an existing user, we create a temporary external user and attach all
 * session/payment records to that userId.
 */

import prisma from '../prisma';
import * as userRepository from '../repositories/user.repository';
import * as sessionRepository from '../repositories/session.repository';
import * as paymentRepository from '../repositories/payment.repository';
import * as auditService from './admin-audit.service';
import * as calicoCalendar from './calico-calendar.service';
import { normalizePhoneNumber } from '../utils/phone';

const { ADMIN_ACTIONS } = auditService;

function externalEmailForPhone(normalizedPhone) {
  const digits = String(normalizedPhone || '').replace(/\D/g, '');
  return `external-${digits}@manual.calico.local`;
}

async function resolveStudent({ name, phoneNumber, email }) {
  const phoneNumberNormalized = normalizePhoneNumber(phoneNumber);
  if (!phoneNumberNormalized) {
    const err = new Error('INVALID_STUDENT_PHONE');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const existing = await userRepository.findByPhoneNumber(phoneNumber);
  if (existing) {
    return { user: existing, created: false };
  }

  const createData = {
    name,
    email: email?.trim().toLowerCase() || externalEmailForPhone(phoneNumberNormalized),
    phoneNumber,
    passwordHash: null,
    role: 'STUDENT',
    kind: 'ExternalTemporary',
    isEmailVerified: false,
    terms: false,
  };

  try {
    const user = await userRepository.create(createData);
    return { user, created: true };
  } catch (err) {
    if (err.code === 'P2002') {
      const user = await userRepository.findByPhoneNumber(phoneNumber);
      if (user) return { user, created: false };
    }
    throw err;
  }
}

async function createCalendarEvent(session) {
  const tutor = session.tutor;
  const student = session.participants?.[0]?.student;
  const courseName = session.course?.name || 'Tutoría';

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
    attendees: student?.email ? [{ email: student.email, displayName: student.name || student.email }] : [],
    location: session.locationType === 'Virtual' ? 'Google Meet (enlace adjunto)' : 'Por definir',
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
}

export async function createManualSession({
  adminId,
  tutorId,
  courseId,
  student,
  startTimestamp,
  endTimestamp,
  locationType = 'Virtual',
  notes,
  topicsToReview,
  amount,
  paymentStatus = 'pending',
  request,
}) {
  const tutor = await userRepository.findById(tutorId);
  if (!tutor || !tutor.isTutorApproved) {
    const err = new Error('TUTOR_NOT_APPROVED');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    const err = new Error('INVALID_SESSION_TIMES');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const sessionAmount = Number(amount);
  if (!Number.isFinite(sessionAmount) || sessionAmount < 0) {
    const err = new Error('INVALID_AMOUNT');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const { user: studentUser, created: createdStudent } = await resolveStudent(student);

  const created = await sessionRepository.createSessionWithParticipant(
    {
      courseId,
      tutorId,
      sessionType: 'Individual',
      maxCapacity: 1,
      startTimestamp: start,
      endTimestamp: end,
      status: 'Accepted',
      locationType,
      notes: notes || 'Tutoría registrada manualmente por administración.',
      topicsToReview: topicsToReview || null,
      source: 'ManualAdmin',
      manualCreatedById: adminId,
    },
    studentUser.id,
    15,
  );

  let session = await sessionRepository.findById(created.id);
  const calendar = await createCalendarEvent(session);
  session = await sessionRepository.findById(created.id);

  const payment = await paymentRepository.create({
    sessionId: session.id,
    studentId: studentUser.id,
    tutorId,
    amount: sessionAmount,
    status: paymentStatus === 'paid' ? 'paid' : 'pending',
    wompiId: null,
  });

  if (payment.status === 'paid' && sessionAmount > 0) {
    await paymentRepository.incrementTutorNextPayment(tutorId, sessionAmount);
  }

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
      amount: sessionAmount,
      calendarEventId: session.googleCalendarEventId || calendar.eventId || null,
    },
  });

  return { session, payment, student: studentUser, createdStudent };
}

export async function confirmManualSessionPayment({ sessionId, adminId, request }) {
  const payment = await paymentRepository.findBySessionId(sessionId);
  if (!payment) {
    const err = new Error('PAYMENT_NOT_FOUND');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (payment.session?.source !== 'ManualAdmin') {
    const err = new Error('PAYMENT_IS_NOT_MANUAL');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (payment.status === 'paid') {
    return payment;
  }

  const updated = await paymentRepository.updateStatus(payment.id, 'paid');
  await paymentRepository.incrementTutorNextPayment(updated.tutorId, Number(updated.amount));

  await auditService.logAction({
    adminId,
    action: ADMIN_ACTIONS.MANUAL_SESSION_PAYMENT_CONFIRM,
    targetType: 'Payment',
    targetId: updated.id,
    request,
    payload: {
      sessionId,
      tutorId: updated.tutorId,
      studentId: updated.studentId,
      amount: Number(updated.amount),
    },
  });

  return updated;
}
