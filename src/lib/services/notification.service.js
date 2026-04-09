/**
 * Notification Service
 * Business logic for in-app notifications.
 *
 * All notification creation flows go through `notify()`, which is fire-and-forget:
 * a failed notification must never break the main business operation.
 */

import * as notificationRepo from '../repositories/notification.repository';

// ─── Core CRUD ────────────────────────────────────────────────────────

export async function getUserNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
  return notificationRepo.findByUserId(userId, { limit, unreadOnly });
}

export async function markAsRead(notificationId, userId) {
  const notification = await notificationRepo.findById(notificationId);
  if (!notification || notification.userId !== userId) {
    const err = new Error('Notification not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return notificationRepo.markAsRead(notificationId);
}

export async function markAllAsRead(userId) {
  return notificationRepo.markAllAsRead(userId);
}

export async function deleteNotification(notificationId, userId) {
  const notification = await notificationRepo.findById(notificationId);
  if (!notification || notification.userId !== userId) {
    const err = new Error('Notification not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return notificationRepo.deleteById(notificationId);
}

export async function getUnreadCount(userId) {
  return notificationRepo.countUnread(userId);
}

// ─── Fire-and-forget helper ───────────────────────────────────────────

/**
 * Create a notification without throwing.
 * Logs errors instead of propagating — notifications are non-critical.
 */
async function notify(data) {
  try {
    return await notificationRepo.create(data);
  } catch (err) {
    console.error(`[Notification] Failed to create (type=${data.type}, userId=${data.userId}):`, err.message);
    return null;
  }
}

// ─── Session lifecycle events ─────────────────────────────────────────

/** Tutor receives: new pending session request (after student pays) */
export async function notifyPendingSessionRequest(session, studentName) {
  const courseName = session.course?.name || 'Tutoría';
  return notify({
    userId: session.tutorId,
    type: 'pending_session_request',
    message: `${studentName} ha solicitado una tutoría de ${courseName}.`,
    sessionId: session.id,
    metadata: { studentName, courseName },
  });
}

/** Student receives: tutor accepted their session */
export async function notifySessionAccepted(session, tutorName) {
  const courseName = session.course?.name || 'Tutoría';
  const participants = session.participants || [];
  const promises = participants.map((p) =>
    notify({
      userId: p.studentId,
      type: 'session_accepted',
      message: `${tutorName} aceptó tu tutoría de ${courseName}.`,
      sessionId: session.id,
      metadata: { tutorName, courseName },
    }),
  );
  return Promise.all(promises);
}

/** Student receives: tutor rejected their session */
export async function notifySessionRejected(session, tutorName) {
  const courseName = session.course?.name || 'Tutoría';
  const participants = session.participants || [];
  const promises = participants.map((p) =>
    notify({
      userId: p.studentId,
      type: 'session_rejected',
      message: `${tutorName} rechazó tu solicitud de tutoría de ${courseName}.`,
      sessionId: session.id,
      metadata: { tutorName, courseName },
    }),
  );
  return Promise.all(promises);
}

/** Other party receives: session was cancelled */
export async function notifySessionCancelled(session, cancelledByUserId) {
  const courseName = session.course?.name || 'Tutoría';
  const promises = [];

  // If a student cancelled → notify tutor
  if (cancelledByUserId !== session.tutorId) {
    const student = session.participants?.find((p) => p.studentId === cancelledByUserId);
    const studentName = student?.student?.name || 'Un estudiante';
    promises.push(
      notify({
        userId: session.tutorId,
        type: 'session_cancelled',
        message: `${studentName} canceló la tutoría de ${courseName}.`,
        sessionId: session.id,
        metadata: { cancelledBy: 'student', courseName },
      }),
    );
  }

  // If tutor cancelled → notify all students
  if (cancelledByUserId === session.tutorId) {
    const tutorName = session.tutor?.name || 'Tu tutor';
    for (const p of session.participants || []) {
      promises.push(
        notify({
          userId: p.studentId,
          type: 'session_cancelled',
          message: `${tutorName} canceló la tutoría de ${courseName}.`,
          sessionId: session.id,
          metadata: { cancelledBy: 'tutor', tutorName, courseName },
        }),
      );
    }
  }

  return Promise.all(promises);
}

/** Students receive: review reminder when session is completed */
export async function notifySessionCompleted(session, tutorName) {
  const courseName = session.course?.name || 'Tutoría';
  const participants = session.participants || [];
  const promises = participants.map((p) =>
    notify({
      userId: p.studentId,
      type: 'review_reminder',
      message: `Tu tutoría de ${courseName} con ${tutorName} fue completada. ¡Déjale una calificación!`,
      sessionId: session.id,
      metadata: { tutorName, courseName },
    }),
  );
  return Promise.all(promises);
}

/** Tutor receives: new student joined their group session */
export async function notifyStudentJoinedGroup(session, studentName) {
  const courseName = session.course?.name || 'Tutoría grupal';
  return notify({
    userId: session.tutorId,
    type: 'student_joined_group',
    message: `${studentName} se unió a tu sesión grupal de ${courseName}.`,
    sessionId: session.id,
    metadata: { studentName, courseName },
  });
}

// ─── Payment events ───────────────────────────────────────────────────

/** Student receives: payment confirmed, session created */
export async function notifyPaymentConfirmed(studentId, session) {
  const courseName = session.course?.name || 'Tutoría';
  return notify({
    userId: studentId,
    type: 'payment_confirmed',
    message: `Tu pago fue confirmado. Tu sesión de ${courseName} ha sido creada.`,
    sessionId: session.id,
    metadata: { courseName },
  });
}

/** Student receives: payment failed */
export async function notifyPaymentFailed(studentId, reference) {
  return notify({
    userId: studentId,
    type: 'payment_failed',
    message: 'Tu pago no pudo ser procesado. Por favor intenta nuevamente.',
    metadata: { reference },
  });
}

// ─── Review events ────────────────────────────────────────────────────

/** Tutor receives: a student submitted a review */
export async function notifyReviewReceived(tutorId, studentName, rating, sessionId) {
  return notify({
    userId: tutorId,
    type: 'review_received',
    message: `${studentName} te calificó con ${rating}/5.`,
    sessionId,
    metadata: { studentName, rating },
  });
}

// ─── Session reminder (prepared for future cron) ──────────────────────

/** Both tutor and students receive: reminder before session starts */
export async function notifySessionReminder(session) {
  const courseName = session.course?.name || 'Tutoría';
  const promises = [];

  // Notify tutor
  promises.push(
    notify({
      userId: session.tutorId,
      type: 'session_reminder',
      message: `Tienes una tutoría de ${courseName} próximamente.`,
      sessionId: session.id,
      metadata: { courseName },
    }),
  );

  // Notify all students
  for (const p of session.participants || []) {
    promises.push(
      notify({
        userId: p.studentId,
        type: 'session_reminder',
        message: `Tu tutoría de ${courseName} comienza pronto.`,
        sessionId: session.id,
        metadata: { courseName },
      }),
    );
  }

  return Promise.all(promises);
}
